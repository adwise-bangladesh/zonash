-- Explicit default-deny policies documenting that these tables are server-only.
-- Permissive policies with USING false / WITH CHECK false grant nothing.

REVOKE ALL ON public.abuse_events FROM anon, authenticated;
REVOKE ALL ON public.coupon_usage FROM anon, authenticated;
REVOKE ALL ON public.customer_login_otps FROM anon, authenticated;
GRANT ALL ON public.abuse_events TO service_role;
GRANT ALL ON public.coupon_usage TO service_role;
GRANT ALL ON public.customer_login_otps TO service_role;
GRANT ALL ON public.order_otps TO service_role;

DROP POLICY IF EXISTS "abuse_events: deny all to non-service" ON public.abuse_events;
CREATE POLICY "abuse_events: deny all to non-service"
  ON public.abuse_events FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "coupon_usage: deny all to non-service" ON public.coupon_usage;
CREATE POLICY "coupon_usage: deny all to non-service"
  ON public.coupon_usage FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "customer_login_otps: deny all to non-service" ON public.customer_login_otps;
CREATE POLICY "customer_login_otps: deny all to non-service"
  ON public.customer_login_otps FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "order_otps: deny writes to non-service" ON public.order_otps;
CREATE POLICY "order_otps: deny writes to non-service"
  ON public.order_otps FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "order_otps: deny updates to non-service" ON public.order_otps;
CREATE POLICY "order_otps: deny updates to non-service"
  ON public.order_otps FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "order_otps: deny deletes to non-service" ON public.order_otps;
CREATE POLICY "order_otps: deny deletes to non-service"
  ON public.order_otps FOR DELETE TO anon, authenticated
  USING (false);

REVOKE INSERT, UPDATE, DELETE ON public.order_otps FROM anon, authenticated;