ALTER TYPE public.customer_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS admin_bot_override boolean NOT NULL DEFAULT false;