
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');
CREATE TYPE public.customer_status AS ENUM ('new','returning','pending_quote','pending_confirm','confirmed','cancelled');
CREATE TYPE public.message_sender AS ENUM ('customer','ai','admin');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- has_role function (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- App settings (single-row keyed by 'key')
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  confidence_threshold NUMERIC NOT NULL DEFAULT 75,
  cooldown_minutes NUMERIC NOT NULL DEFAULT 1,
  manual_chat_hours NUMERIC NOT NULL DEFAULT 360,
  phone_mute_hours NUMERIC NOT NULL DEFAULT 1,
  fallback_mute_hours NUMERIC NOT NULL DEFAULT 1,
  followup_hours NUMERIC NOT NULL DEFAULT 2,
  followup_enabled BOOLEAN NOT NULL DEFAULT true,
  schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  start_time TEXT NOT NULL DEFAULT '18:00',
  end_time TEXT NOT NULL DEFAULT '08:00',
  strict_rules TEXT[] NOT NULL DEFAULT '{}',
  sla_hours NUMERIC NOT NULL DEFAULT 24,
  fallback_message TEXT NOT NULL DEFAULT 'ขอบคุณที่ติดต่อมาค่ะ ขณะนี้อยู่นอกเวลาทำการ เจ้าหน้าที่จะรีบติดต่อกลับโดยเร็วที่สุดนะคะ 🙏',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Package categories
CREATE TABLE public.package_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catering packages
CREATE TABLE public.catering_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  min_condition TEXT,
  pricing_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_instruction TEXT,
  notes TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Promotions
CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  applicable_categories TEXT[] NOT NULL DEFAULT '{}',
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  nickname TEXT,
  picture_url TEXT,
  phone TEXT,
  status public.customer_status NOT NULL DEFAULT 'new',
  ai_active BOOLEAN NOT NULL DEFAULT true,
  manual_chat_until TIMESTAMPTZ,
  ai_resumed_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  event_type TEXT,
  event_month TEXT,
  event_date DATE,
  guest_count INT,
  contact_year INT,
  venue TEXT,
  clv_amount NUMERIC NOT NULL DEFAULT 0,
  sla_deadline TIMESTAMPTZ,
  last_sent_image_titles TEXT[] NOT NULL DEFAULT '{}',
  unread_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_snippet TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_last_message_at ON public.customers(last_message_at DESC);
CREATE INDEX idx_customers_status ON public.customers(status);

-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  sender public.message_sender NOT NULL DEFAULT 'customer',
  confidence_score NUMERIC,
  is_fallback BOOLEAN NOT NULL DEFAULT false,
  line_message_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_customer_created ON public.conversations(customer_id, created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_uat BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_app_settings_uat BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catering_packages_uat BEFORE UPDATE ON public.catering_packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_promotions_uat BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_customers_uat BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  -- First user becomes admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catering_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- User roles policies
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Authenticated read/write for business data
CREATE POLICY "Auth read app_settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write app_settings" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read package_categories" ON public.package_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write package_categories" ON public.package_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read catering_packages" ON public.catering_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write catering_packages" ON public.catering_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read promotions" ON public.promotions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write promotions" ON public.promotions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth read conversations" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write conversations" ON public.conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Default app settings row
INSERT INTO public.app_settings (key) VALUES ('ai_config') ON CONFLICT (key) DO NOTHING;
