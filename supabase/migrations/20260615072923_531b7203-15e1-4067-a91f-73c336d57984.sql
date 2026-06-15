
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_sender text;

UPDATE public.customers c SET last_sender = sub.sender
FROM (
  SELECT DISTINCT ON (customer_id) customer_id, sender::text AS sender
  FROM public.conversations
  ORDER BY customer_id, created_at DESC
) sub WHERE sub.customer_id = c.id AND (c.last_sender IS DISTINCT FROM sub.sender);

CREATE OR REPLACE FUNCTION public.update_customer_last_sender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.customers SET last_sender = NEW.sender::text WHERE id = NEW.customer_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conversations_last_sender ON public.conversations;
CREATE TRIGGER trg_conversations_last_sender
AFTER INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.update_customer_last_sender();

CREATE INDEX IF NOT EXISTS idx_customers_last_sender ON public.customers(last_sender) WHERE last_sender = 'ai';
