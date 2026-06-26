-- Phase 3: Qualified Lead Type Today
-- RPC: นับลูกค้าที่เข้า pending_quote วันนี้ (Asia/Bangkok) — unique per customer
-- จัดประเภท: needs_review > returning > reactivated > new

CREATE OR REPLACE FUNCTION public.dashboard_qualified_lead_types_today()
RETURNS TABLE(
  customer_id uuid,
  lead_type text,
  display_name text,
  nickname text,
  status text,
  customer_origin text,
  entered_pending_at timestamp with time zone,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone,
  prev_message_at timestamp with time zone,
  has_events boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bkk AS (
    SELECT date_trunc('day', (now() AT TIME ZONE 'Asia/Bangkok')) AT TIME ZONE 'Asia/Bangkok' AS start_ts
  ),
  -- ลูกค้าที่เข้า pending_quote วันนี้ (เอาครั้งแรกของวัน)
  entered_today AS (
    SELECT
      l.customer_id,
      MIN(l.changed_at) AS entered_pending_at
    FROM public.customer_status_log l, bkk b
    WHERE l.new_status = 'pending_quote'
      AND l.changed_at >= b.start_ts
    GROUP BY l.customer_id
  ),
  enriched AS (
    SELECT
      c.id,
      c.display_name,
      c.nickname,
      c.status::text AS status,
      COALESCE(c.customer_origin, 'new') AS customer_origin,
      c.created_at,
      c.last_message_at,
      e.entered_pending_at,
      EXISTS (SELECT 1 FROM public.customer_events ce WHERE ce.customer_id = c.id) AS has_events,
      (SELECT MAX(conv.created_at)
         FROM public.conversations conv
        WHERE conv.customer_id = c.id
          AND conv.created_at < (SELECT start_ts FROM bkk)) AS prev_msg
    FROM entered_today e
    JOIN public.customers c ON c.id = e.customer_id
  )
  SELECT
    en.id,
    CASE
      WHEN en.customer_origin IN ('needs_review','legacy') THEN 'needs_review'
      WHEN en.has_events THEN 'returning'
      WHEN en.created_at < (SELECT start_ts FROM bkk)
           AND en.prev_msg IS NOT NULL
           AND en.prev_msg <= (now() - interval '30 days') THEN 'reactivated'
      ELSE 'new'
    END AS lead_type,
    en.display_name,
    en.nickname,
    en.status,
    en.customer_origin,
    en.entered_pending_at,
    en.last_message_at,
    en.created_at,
    en.prev_msg,
    en.has_events
  FROM enriched en
  ORDER BY en.entered_pending_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_qualified_lead_types_today() TO authenticated;