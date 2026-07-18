DROP POLICY IF EXISTS "orders_cache: customers read own by email" ON public.orders_cache;
CREATE POLICY "orders_cache: customers read own by email"
ON public.orders_cache FOR SELECT
TO authenticated
USING (
  customer_email IS NOT NULL
  AND lower(customer_email) = lower((auth.jwt() ->> 'email'))
);