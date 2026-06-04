
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS quote_token text,
  ADD COLUMN IF NOT EXISTS quoted_message_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_quoted_message_id
  ON public.conversations(quoted_message_id)
  WHERE quoted_message_id IS NOT NULL;
