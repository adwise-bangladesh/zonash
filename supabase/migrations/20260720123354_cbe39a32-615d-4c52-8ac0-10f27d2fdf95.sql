CREATE TABLE public.abuse_events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  ip TEXT,
  fingerprint TEXT,
  phone TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.abuse_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.abuse_events_id_seq TO service_role;

ALTER TABLE public.abuse_events ENABLE ROW LEVEL SECURITY;

-- No policies: service_role bypasses RLS; anon/authenticated have zero access.

CREATE INDEX idx_abuse_events_ip_time ON public.abuse_events (ip, created_at DESC) WHERE ip IS NOT NULL;
CREATE INDEX idx_abuse_events_fp_time ON public.abuse_events (fingerprint, created_at DESC) WHERE fingerprint IS NOT NULL;
CREATE INDEX idx_abuse_events_phone_time ON public.abuse_events (phone, created_at DESC) WHERE phone IS NOT NULL;
CREATE INDEX idx_abuse_events_kind_time ON public.abuse_events (kind, created_at DESC);