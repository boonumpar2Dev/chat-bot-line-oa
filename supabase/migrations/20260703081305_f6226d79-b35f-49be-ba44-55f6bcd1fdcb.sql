
-- Step 0: Backup state of customers who chatted today (Asia/Bangkok)
-- Read-only snapshot. Does NOT modify any customer.
CREATE TABLE public._bak_live_rollout_20260703 AS
SELECT
  id AS customer_id,
  status::text AS status,
  ai_active,
  manual_chat_until,
  admin_bot_override,
  ai_resumed_at,
  last_message_at,
  nickname,
  display_name,
  now() AS backed_up_at
FROM public.customers
WHERE last_message_at >= (now() AT TIME ZONE 'Asia/Bangkok')::date AT TIME ZONE 'Asia/Bangkok';

-- Grants: backup table is admin-only, read via service_role
GRANT ALL ON public._bak_live_rollout_20260703 TO service_role;

-- RLS: enable, no policies → nobody in the app can read/write it
ALTER TABLE public._bak_live_rollout_20260703 ENABLE ROW LEVEL SECURITY;

-- Index for fast lookup on restore
CREATE INDEX ON public._bak_live_rollout_20260703 (customer_id);
