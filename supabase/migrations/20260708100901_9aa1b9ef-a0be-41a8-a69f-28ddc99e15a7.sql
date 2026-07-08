UPDATE public.app_settings
SET ai_policy_config = jsonb_set(
  jsonb_set(ai_policy_config, '{live_rollout_enabled}', 'true'::jsonb, true),
  '{live_rollout_until}', to_jsonb('2026-07-08T23:59:00+07:00'::text), true
);