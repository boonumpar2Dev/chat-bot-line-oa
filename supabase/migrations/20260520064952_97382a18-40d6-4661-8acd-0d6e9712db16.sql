
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS menu_request_keywords text[] NOT NULL DEFAULT ARRAY['เมนู','ตัวอย่าง','ดูรูป','ขอรูป','รูปอาหาร','รูปจัด','หน้าตา','ภาพ']::text[],
  ADD COLUMN IF NOT EXISTS kb_menu_title_keywords text[] NOT NULL DEFAULT ARRAY['เมนู','ตัวอย่าง','ซุ้ม']::text[],
  ADD COLUMN IF NOT EXISTS service_area_kb_title text NOT NULL DEFAULT 'พื้นที่ที่บุญนำพาสามารถไปให้บริการได้',
  ADD COLUMN IF NOT EXISTS location_keywords text[] NOT NULL DEFAULT ARRAY[
    'จังหวัด','จัดที่','อยู่ที่','จัดงานที่','อ.','อำเภอ',
    'เชียงใหม่','เชียงราย','ภูเก็ต','สงขลา','หาดใหญ่','ตรัง','กระบี่','พังงา',
    'สุราษ','นครศรี','ระนอง','ชุมพร','ประจวบ','เพชรบุรี','ราชบุรี',
    'ตาก','พิษณุโลก','สุโขทัย','กำแพง','พิจิตร','เพชรบูรณ์',
    'น่าน','พะเยา','แพร่','ลำปาง','ลำพูน','แม่ฮ่องสอน','อุตรดิตถ์',
    'พัทลุง','ยะลา','ปัตตานี','นราธิวาส','สตูล','ตราด'
  ]::text[];
