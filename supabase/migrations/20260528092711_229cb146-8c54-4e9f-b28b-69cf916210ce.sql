UPDATE public.app_settings
SET strict_rules = COALESCE(strict_rules, ARRAY[]::text[]) || ARRAY[
'🖼️ ถ้าจะพูดว่า "ลองดูรูป/ดูภาพ/ดูหน้าตา/ดูตัวอย่าง/แนบรูปให้/ส่งรูปให้" → ต้องใส่ image_titles ที่ตรงกับสิ่งที่ชวนดู ทุกครั้ง ห้ามพูดเชิญชวนดูรูปลอย ๆ โดยไม่มี image_titles เด็ดขาด ถ้าไม่มีรูปให้ส่ง → ห้ามพูดถึงการ "ดูรูป/ส่งรูป" เลย'
]::text[]
WHERE key = 'ai_config';