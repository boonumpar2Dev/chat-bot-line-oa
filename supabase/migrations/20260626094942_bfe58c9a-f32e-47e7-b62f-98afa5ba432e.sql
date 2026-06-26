CREATE OR REPLACE FUNCTION public.dashboard_lead_types_today()
 RETURNS TABLE(customer_id uuid, lead_type text, display_name text, nickname text, status text, customer_origin text, last_message_at timestamp with time zone, created_at timestamp with time zone, prev_message_at timestamp with time zone, has_events boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Admin's explicit tag wins (customer_origin set via UI)
      WHEN a.customer_origin IN ('needs_review','legacy') THEN 'needs_review'
      WHEN a.customer_origin = 'returning' THEN 'returning'
      WHEN a.customer_origin = 'new' THEN
        CASE
          WHEN a.created_at >= (SELECT start_ts FROM bkk) THEN 'new'
          WHEN a.prev_msg IS NOT NULL AND a.prev_msg <= (now() - interval '30 days') THEN 'reactivated'
          WHEN a.has_events THEN 'returning'
          ELSE 'new'
        END
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
$function$;