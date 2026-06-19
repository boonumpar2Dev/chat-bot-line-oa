CREATE TABLE IF NOT EXISTS public.customer_status_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz DEFAULT now(),
  note text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_status_log TO authenticated;
GRANT ALL ON public.customer_status_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_status_log_customer ON public.customer_status_log(customer_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_log_date ON public.customer_status_log(changed_at);

ALTER TABLE public.customer_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated" ON public.customer_status_log
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_customer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.customer_status_log (customer_id, old_status, new_status)
    VALUES (NEW.id, OLD.status::text, NEW.status::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_status_change ON public.customers;
CREATE TRIGGER trg_customer_status_change
  AFTER UPDATE OF status ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.log_customer_status_change();