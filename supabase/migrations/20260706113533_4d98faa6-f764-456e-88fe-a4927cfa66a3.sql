-- Phase C: seed default service_scopes into app_settings.ai_policy_config (jsonb, no schema change)
UPDATE public.app_settings
SET ai_policy_config = COALESCE(ai_policy_config, '{}'::jsonb) || jsonb_build_object(
  'service_scopes', '[
    {"id":"merit_chinese_table","name":"บุญ+โต๊ะจีน","sort_order":10,"aliases":["โต๊ะจีน","ทำบุญโต๊ะจีน","บุญโต๊ะจีน"],"accepted":true,"requires_handover":false,"standard_reply":"","kb_category_id":null,"package_ids":[],"notes_for_ai":"งานบุญ/พิธี + อาหารโต๊ะจีน"},
    {"id":"merit_buffet","name":"บุญ+บุฟเฟต์","sort_order":20,"aliases":["บุญบุฟเฟต์","ทำบุญบุฟเฟต์"],"accepted":true,"requires_handover":false,"standard_reply":"","kb_category_id":null,"package_ids":[],"notes_for_ai":"งานบุญ/พิธี + อาหารบุฟเฟต์"},
    {"id":"merit_food_stall","name":"บุญ+ซุ้มอาหาร","sort_order":30,"aliases":["ซุ้มอาหาร","บุญซุ้มอาหาร"],"accepted":true,"requires_handover":false,"standard_reply":"","kb_category_id":null,"package_ids":[],"notes_for_ai":"งานบุญ/พิธี + ซุ้มอาหาร"},
    {"id":"rental_ceremony_no_food","name":"เช่าอุปกรณ์+พิธีสงฆ์ยกเว้นอาหาร","sort_order":40,"aliases":["เช่าอุปกรณ์+พิธีสงฆ์","เช่าอุปกรณ์พิธีสงฆ์ ไม่เอาอาหาร","พิธีสงฆ์ไม่เอาอาหาร"],"accepted":true,"requires_handover":false,"standard_reply":"","kb_category_id":null,"package_ids":[],"notes_for_ai":"เช่าอุปกรณ์พิธี + นิมนต์พระ ไม่มีอาหาร (รับได้)"},
    {"id":"buangsuang","name":"บวงสรวง","sort_order":50,"aliases":["พิธีบวงสรวง"],"accepted":true,"requires_handover":false,"standard_reply":"","kb_category_id":null,"package_ids":[],"notes_for_ai":"พิธีบวงสรวงโดยเฉพาะ"},
    {"id":"food_only_buffet","name":"งานอาหารเท่านั้นรูปแบบบุฟเฟต์","sort_order":60,"aliases":["อาหารอย่างเดียว","จัดเลี้ยงอย่างเดียว","บุฟเฟต์อย่างเดียว","งานอาหารอย่างเดียว"],"accepted":true,"requires_handover":false,"standard_reply":"","kb_category_id":null,"package_ids":[],"notes_for_ai":"อาหารบุฟเฟต์ standalone ไม่มีพิธีสงฆ์"},
    {"id":"unclear","name":"ยังไม่ชัดเจน","sort_order":70,"aliases":[],"accepted":true,"requires_handover":false,"standard_reply":"","kb_category_id":null,"package_ids":[],"notes_for_ai":"ลูกค้ายังไม่ระบุ scope → ต้องถามแยก scope ก่อน ห้ามเดางานบุญครบชุด"}
  ]'::jsonb,
  'service_scopes_reject_rules', '[
    {"trigger_aliases":["เช่าโต๊ะเก้าอี้อย่างเดียว","เช่าโต๊ะอย่างเดียว","เช่าโต๊ะเก้าอี้"],"standard_reply":"ตอนนี้บุญนำพายังไม่มีบริการให้เช่าโต๊ะเก้าอี้อย่างเดียวค่ะ แต่ถ้าลูกค้าจัดงานหรือใช้งานอาหารกับเรา ทีมงานสามารถช่วยดูอุปกรณ์ที่เกี่ยวข้องให้ได้ค่ะ"}
  ]'::jsonb,
  'service_scope_ambiguous_reply', 'ลูกค้าสนใจแบบบุญ+อาหารครบชุด หรือเฉพาะอาหาร/เฉพาะพิธีสงฆ์คะ?'
)
WHERE key = 'ai_config';