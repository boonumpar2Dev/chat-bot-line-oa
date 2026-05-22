ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS self_pronouns_allowed text[] NOT NULL DEFAULT ARRAY['ทีมงาน','แอดมิน','บุญนำพา']::text[],
  ADD COLUMN IF NOT EXISTS customer_pronouns_allowed text[] NOT NULL DEFAULT ARRAY['ลูกค้า','คุณ{ชื่อ}']::text[],
  ADD COLUMN IF NOT EXISTS forbidden_pronouns text[] NOT NULL DEFAULT ARRAY['แม่หมอ','หมอ','พี่','น้อง','เรา','ดิฉัน','ผม','หนู','เจ๊','พี่สาว','ตัวเอง','เธอ','คุณเธอ','คุณพี่','คุณน้อง']::text[];