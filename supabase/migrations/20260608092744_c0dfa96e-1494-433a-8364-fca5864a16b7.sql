ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS exclude_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclude_statuses text[] NOT NULL DEFAULT '{}';