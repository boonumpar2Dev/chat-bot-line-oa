-- 0) Expand allowed values for customer_origin
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_customer_origin_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_customer_origin_check
  CHECK (customer_origin = ANY (ARRAY['new','returning','legacy','needs_review','reactivated']));

-- 1) Rollout date setting
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS lead_type_logic_start_date date;
UPDATE public.app_settings
   SET lead_type_logic_start_date = (now() AT TIME ZONE 'Asia/Bangkok')::date
 WHERE lead_type_logic_start_date IS NULL;

-- 2) Backfill customer_origin (order matters)
UPDATE public.customers
   SET customer_origin = 'returning'
 WHERE EXISTS (SELECT 1 FROM public.customer_events ce WHERE ce.customer_id = customers.id)
   AND COALESCE(customer_origin, '') <> 'returning';

UPDATE public.customers
   SET customer_origin = 'needs_review'
 WHERE customer_origin = 'legacy';

UPDATE public.customers
   SET customer_origin = 'needs_review'
 WHERE customer_origin = 'returning'
   AND NOT EXISTS (SELECT 1 FROM public.customer_events ce WHERE ce.customer_id = customers.id);

UPDATE public.customers
   SET customer_origin = 'needs_review'
 WHERE customer_origin = 'new'
   AND status::text IN ('confirmed','confirmed_returning','completed')
   AND NOT EXISTS (SELECT 1 FROM public.customer_events ce WHERE ce.customer_id = customers.id);

-- 3) Dashboard RPC
CREATE OR REPLACE FUNCTION public.dashboard_lead_types_today()
RETURNS TABLE (
  customer_id uuid,
  lead_type text,
  display_name text,
  nickname text,
  status text,
  customer_origin text,
  last_message_at timestamptz,
  created_at timestamptz,
  prev_message_at timestamptz,
  has_events boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bkk AS (
    SELECT date_trunc('day', (now() AT TIME ZONE 'Asia/Bangkok')) AT TIME ZONE 'Asia/Bangkok' AS start_ts
  ),
  active AS (
    SELECT
      c.id,
      c.display_name,
      c.nickname,
      c.status::text  AS status,
      COALESCE(c.customer_origin, 'new') AS customer_origin,
      c.created_at,
      c.last_message_at,
      EXISTS (SELECT 1 FROM public.customer_events ce WHERE ce.customer_id = c.id) AS has_events,
      (SELECT MAX(conv.created_at)
         FROM public.conversations conv
        WHERE conv.customer_id = c.id
          AND conv.created_at < (SELECT start_ts FROM bkk)) AS prev_msg
    FROM public.customers c, bkk b
    WHERE c.last_message_at >= b.start_ts
  )
  SELECT
    a.id,
    CASE
      WHEN a.has_events THEN 'returning'
      WHEN a.customer_origin IN ('needs_review','legacy')
        OR (a.customer_origin = 'returning' AND NOT a.has_events)
        OR a.status IN ('confirmed','confirmed_returning','completed')
        THEN 'needs_review'
      WHEN a.created_at >= (SELECT start_ts FROM bkk) THEN 'new'
      WHEN a.prev_msg IS NOT NULL AND a.prev_msg <= (now() - interval '30 days') THEN 'reactivated'
      ELSE 'other'
    END,
    a.display_name,
    a.nickname,
    a.status,
    a.customer_origin,
    a.last_message_at,
    a.created_at,
    a.prev_msg,
    a.has_events
  FROM active a;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_lead_types_today() TO authenticated, service_role;