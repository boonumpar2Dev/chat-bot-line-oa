UPDATE public.app_settings
SET ai_policy_config = jsonb_set(
  ai_policy_config,
  '{test_customer_ids}',
  '["df0ea919-3ef7-4334-b361-67e1a7d0602d"]'::jsonb,
  true
),
updated_at = now();