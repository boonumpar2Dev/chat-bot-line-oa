ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS customer_origin text
DEFAULT 'new'
CHECK (customer_origin IN ('new','returning','legacy'));

COMMENT ON COLUMN public.customers.customer_origin IS
'new=ลูกค้าใหม่จริงๆ, returning=ลูกค้าเก่ากลับมาจัดอีก, legacy=ลูกค้าก่อนเปิดระบบ';