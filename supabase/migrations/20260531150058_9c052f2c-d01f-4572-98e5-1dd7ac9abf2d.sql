-- Add manual Tier field on customers + admin-managed tier_list config
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tier text;

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS tier_list jsonb NOT NULL DEFAULT '[
  {"name":"VIP","color":"#f59e0b"},
  {"name":"ลูกค้าทั่วไป","color":"#94a3b8"}
]'::jsonb;

-- Drop legacy auto-Lifecycle columns (no longer used)
ALTER TABLE public.app_settings
  DROP COLUMN IF EXISTS vip_customer_greeting,
  DROP COLUMN IF EXISTS returning_customer_greeting,
  DROP COLUMN IF EXISTS returning_context_instruction,
  DROP COLUMN IF EXISTS returning_days_threshold,
  DROP COLUMN IF EXISTS returning_skip_intent_questions;