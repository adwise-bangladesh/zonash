CREATE TABLE public.coupon_usage (
  id BIGSERIAL PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  phone TEXT NOT NULL,
  wc_order_id BIGINT NOT NULL,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_code, wc_order_id)
);

GRANT ALL ON public.coupon_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.coupon_usage_id_seq TO service_role;

ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; end-users get nothing.

CREATE INDEX idx_coupon_usage_code ON public.coupon_usage (coupon_code, created_at DESC);
CREATE INDEX idx_coupon_usage_code_phone ON public.coupon_usage (coupon_code, phone);