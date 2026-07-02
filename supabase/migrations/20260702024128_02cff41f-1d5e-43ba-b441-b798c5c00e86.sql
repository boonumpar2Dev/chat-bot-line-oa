CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_conversations_message_trgm ON public.conversations USING gin (message extensions.gin_trgm_ops);