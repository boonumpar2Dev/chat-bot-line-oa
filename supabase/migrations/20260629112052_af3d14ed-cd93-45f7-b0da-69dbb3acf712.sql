
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS quotation_auto_detection jsonb NOT NULL DEFAULT '{
  "enabled": true,
  "allowedBackdateDays": 7,
  "allowCompletedToPendingConfirm": true,
  "patterns": [
    {"name": "BNP Quote", "enabled": true, "regex": "BNP-[NV](\\d{4})(\\d{2})", "quoteType": "bnp_quote"},
    {"name": "Food Quote H-N", "enabled": true, "regex": "H-N(\\d{4})(\\d{2})-\\d+", "quoteType": "food_quote"}
  ],
  "datePrefix": {
    "enabled": true,
    "regex": "^(\\d{2})(\\d{2})(\\d{4})",
    "format": "DDMMBBBB"
  },
  "referenceFilePrefixes": ["OLD-", "REF-", "อ้างอิง-", "ใบเก่า-"]
}'::jsonb;

UPDATE public.app_settings
SET quotation_auto_detection = '{
  "enabled": true,
  "allowedBackdateDays": 7,
  "allowCompletedToPendingConfirm": true,
  "patterns": [
    {"name": "BNP Quote", "enabled": true, "regex": "BNP-[NV](\\d{4})(\\d{2})", "quoteType": "bnp_quote"},
    {"name": "Food Quote H-N", "enabled": true, "regex": "H-N(\\d{4})(\\d{2})-\\d+", "quoteType": "food_quote"}
  ],
  "datePrefix": {
    "enabled": true,
    "regex": "^(\\d{2})(\\d{2})(\\d{4})",
    "format": "DDMMBBBB"
  },
  "referenceFilePrefixes": ["OLD-", "REF-", "อ้างอิง-", "ใบเก่า-"]
}'::jsonb
WHERE quotation_auto_detection IS NULL;
