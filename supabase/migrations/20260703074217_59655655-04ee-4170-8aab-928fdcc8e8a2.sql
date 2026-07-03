UPDATE public.app_settings
SET ai_policy_config = COALESCE(ai_policy_config, '{}'::jsonb)
  || jsonb_build_object(
       'live_rollout_enabled', true,
       'live_rollout_until', '2026-07-03T17:00:00+07:00'
     );