-- Add new enum value for "confirmed (returning customer)"
ALTER TYPE public.customer_status ADD VALUE IF NOT EXISTS 'confirmed_returning' AFTER 'confirmed';