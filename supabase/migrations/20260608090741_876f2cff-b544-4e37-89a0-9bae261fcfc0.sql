-- Drop duplicate auto-tag triggers, keep only one
DROP TRIGGER IF EXISTS apply_auto_tags_trigger ON public.customers;
DROP TRIGGER IF EXISTS customers_auto_tag ON public.customers;
DROP TRIGGER IF EXISTS trg_apply_auto_tags ON public.customers;

-- Recreate single canonical trigger
CREATE TRIGGER trg_apply_auto_tags
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.apply_auto_tags();