UPDATE public.app_settings
SET ai_policy_config = COALESCE(ai_policy_config, '{}'::jsonb) || jsonb_build_object(
  'delivery_rules', jsonb_build_object(
    'default_message', 'งานอาหารอย่างเดียวมีค่าขนส่งตามพื้นที่ค่ะ',
    'no_free_delivery_unless_specified', true,
    'unknown_area_reply', 'มีค่าขนส่งตามพื้นที่ค่ะ ขอประสานงานทีมงานเช็กให้เพิ่มเติมนะคะ',
    'zones', '[]'::jsonb
  )
)
WHERE key = 'ai_config';