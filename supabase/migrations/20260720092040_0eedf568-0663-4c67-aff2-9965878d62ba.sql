CREATE TABLE IF NOT EXISTS public.customer_login_otps (
  phone text PRIMARY KEY,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  send_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_login_otps TO service_role;
ALTER TABLE public.customer_login_otps ENABLE ROW LEVEL SECURITY;