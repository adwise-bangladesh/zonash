
CREATE TABLE public.order_otps (
  wc_order_id BIGINT PRIMARY KEY,
  phone TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INT NOT NULL DEFAULT 1,
  tracking JSONB,
  ip_address TEXT,
  decision TEXT,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_otps TO authenticated;
GRANT ALL ON public.order_otps TO service_role;

ALTER TABLE public.order_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view order OTPs"
  ON public.order_otps
  FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE INDEX order_otps_phone_hash_idx ON public.order_otps (phone_hash, created_at DESC);
CREATE INDEX order_otps_created_at_idx ON public.order_otps (created_at DESC);

CREATE TRIGGER order_otps_set_updated_at
  BEFORE UPDATE ON public.order_otps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
