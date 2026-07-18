
-- =========================================================
-- ROLES
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'viewer', 'customer');

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- USER ROLES (separate table — prevents privilege escalation)
-- =========================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer helper — bypasses RLS to avoid recursive checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'staff', 'viewer')
  )
$$;

-- =========================================================
-- ORDERS CACHE (fast mirror of WooCommerce orders)
-- =========================================================
CREATE TABLE public.orders_cache (
  wc_order_id bigint PRIMARY KEY,
  order_number text NOT NULL,
  status text NOT NULL,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  customer_email text,
  customer_name text,
  payment_method text,
  payment_method_title text,
  items_count int NOT NULL DEFAULT 0,
  date_created timestamptz NOT NULL,
  date_modified timestamptz NOT NULL,
  raw jsonb NOT NULL,
  fts tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(order_number, '') || ' ' ||
      coalesce(customer_email, '') || ' ' ||
      coalesce(customer_name, '')
    )
  ) STORED,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orders_cache TO authenticated;
GRANT ALL ON public.orders_cache TO service_role;
ALTER TABLE public.orders_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX orders_cache_status_idx ON public.orders_cache(status);
CREATE INDEX orders_cache_date_created_idx ON public.orders_cache(date_created DESC);
CREATE INDEX orders_cache_customer_email_idx ON public.orders_cache(customer_email);
CREATE INDEX orders_cache_fts_idx ON public.orders_cache USING GIN(fts);

-- =========================================================
-- WEBHOOK EVENTS (idempotency)
-- =========================================================
CREATE TABLE public.webhook_events (
  delivery_id text PRIMARY KEY,
  topic text NOT NULL,
  source text NOT NULL DEFAULT 'woocommerce',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  payload jsonb
);
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- =========================================================
-- ORDER AUDIT LOG
-- =========================================================
CREATE TABLE public.order_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wc_order_id bigint NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_audit_log TO authenticated;
GRANT ALL ON public.order_audit_log TO service_role;
ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX order_audit_log_wc_order_id_idx ON public.order_audit_log(wc_order_id, created_at DESC);

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX notifications_user_id_idx ON public.notifications(user_id, created_at DESC);

-- =========================================================
-- POLICIES
-- =========================================================

-- profiles
CREATE POLICY "profiles: read own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles: admins read all" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles: update own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles: insert own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles
CREATE POLICY "user_roles: read own" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles: admins read all" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- orders_cache
CREATE POLICY "orders_cache: staff read all" ON public.orders_cache
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "orders_cache: customers read own by email" ON public.orders_cache
  FOR SELECT TO authenticated USING (
    customer_email IS NOT NULL
    AND customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- order_audit_log
CREATE POLICY "audit: staff read all" ON public.order_audit_log
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "audit: staff insert" ON public.order_audit_log
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

-- notifications
CREATE POLICY "notifications: read own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications: update own (mark read)" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- TRIGGERS
-- =========================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + assign default customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- REALTIME
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
