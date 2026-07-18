
ALTER TABLE public.orders_cache
  ADD COLUMN IF NOT EXISTS subtotal          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_total    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total         numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_phone    text,
  ADD COLUMN IF NOT EXISTS billing_city      text,
  ADD COLUMN IF NOT EXISTS billing_country   text,
  ADD COLUMN IF NOT EXISTS shipping_name         text,
  ADD COLUMN IF NOT EXISTS shipping_address_1    text,
  ADD COLUMN IF NOT EXISTS shipping_address_2    text,
  ADD COLUMN IF NOT EXISTS shipping_city         text,
  ADD COLUMN IF NOT EXISTS shipping_state        text,
  ADD COLUMN IF NOT EXISTS shipping_postcode     text,
  ADD COLUMN IF NOT EXISTS shipping_country      text,
  ADD COLUMN IF NOT EXISTS shipping_phone        text,
  ADD COLUMN IF NOT EXISTS items             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skus              text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS date_paid         timestamptz,
  ADD COLUMN IF NOT EXISTS date_completed    timestamptz,
  ADD COLUMN IF NOT EXISTS customer_note     text,
  ADD COLUMN IF NOT EXISTS transaction_id    text,
  ADD COLUMN IF NOT EXISTS ip_address        text,
  ADD COLUMN IF NOT EXISTS source_channel    text;

ALTER TABLE public.orders_cache DROP COLUMN IF EXISTS fts;
ALTER TABLE public.orders_cache
  ADD COLUMN fts tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(order_number,'') || ' ' ||
      coalesce(customer_email,'') || ' ' ||
      coalesce(customer_name,'') || ' ' ||
      coalesce(customer_phone,'') || ' ' ||
      coalesce(shipping_name,'') || ' ' ||
      coalesce(shipping_address_1,'') || ' ' ||
      coalesce(shipping_city,'') || ' ' ||
      coalesce(shipping_postcode,'')
    )
  ) STORED;

DROP INDEX IF EXISTS public.orders_cache_status_idx;
DROP INDEX IF EXISTS public.orders_cache_date_created_idx;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS orders_cache_status_date_idx
  ON public.orders_cache (status, date_created DESC);
CREATE INDEX IF NOT EXISTS orders_cache_date_desc_idx
  ON public.orders_cache (date_created DESC);
CREATE INDEX IF NOT EXISTS orders_cache_email_lower_idx
  ON public.orders_cache (lower(customer_email));
CREATE INDEX IF NOT EXISTS orders_cache_order_number_trgm_idx
  ON public.orders_cache USING gin (order_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS orders_cache_phone_idx
  ON public.orders_cache (customer_phone);
CREATE INDEX IF NOT EXISTS orders_cache_skus_gin_idx
  ON public.orders_cache USING gin (skus);
CREATE INDEX IF NOT EXISTS orders_cache_fts_idx
  ON public.orders_cache USING gin (fts);

CREATE OR REPLACE FUNCTION public.orders_cache_status_counts()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status, count(*)::bigint
  FROM public.orders_cache
  GROUP BY status
$$;

REVOKE ALL ON FUNCTION public.orders_cache_status_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_cache_status_counts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orders_cache_touch_synced_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.synced_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_cache_synced_at ON public.orders_cache;
CREATE TRIGGER orders_cache_synced_at
  BEFORE INSERT OR UPDATE ON public.orders_cache
  FOR EACH ROW EXECUTE FUNCTION public.orders_cache_touch_synced_at();
