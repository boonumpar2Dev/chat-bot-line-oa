UPDATE public.app_settings
SET ai_policy_config = jsonb_set(
  jsonb_set(
    COALESCE(ai_policy_config, '{}'::jsonb),
    '{live_rollout_enabled}', 'true'::jsonb, true
  ),
  '{live_rollout_until}', '"2026-07-21T23:59:00+07:00"'::jsonb, true
);