ALTER TYPE public.customer_status ADD VALUE IF NOT EXISTS 'postponed';

UPDATE public.app_settings
SET auto_tag_settings = jsonb_set(
  COALESCE(auto_tag_settings, '{}'::jsonb),
  '{status_tag_map,postponed}',
  '"เลื่อนงาน"'::jsonb,
  true
);

INSERT INTO public.tags (name, color)
VALUES ('เลื่อนงาน', '#eab308')
ON CONFLICT (name) DO NOTHING;