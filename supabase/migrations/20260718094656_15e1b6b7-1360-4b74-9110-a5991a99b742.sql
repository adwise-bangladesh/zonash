
-- 1) order_ops table
CREATE TABLE public.order_ops (
  wc_order_id BIGINT PRIMARY KEY,
  courier TEXT,
  tracking_number TEXT,
  pickup_slot TEXT,
  internal_notes TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_ops TO authenticated;
GRANT ALL ON public.order_ops TO service_role;

ALTER TABLE public.order_ops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_ops: staff can read"
  ON public.order_ops FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "order_ops: staff can insert"
  ON public.order_ops FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "order_ops: staff can update"
  ON public.order_ops FOR UPDATE
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "order_ops: staff can delete"
  ON public.order_ops FOR DELETE
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE TRIGGER order_ops_set_updated_at
  BEFORE UPDATE ON public.order_ops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX order_ops_tracking_idx ON public.order_ops (tracking_number)
  WHERE tracking_number IS NOT NULL;
CREATE INDEX order_ops_courier_idx ON public.order_ops (courier)
  WHERE courier IS NOT NULL;

-- 2) Customer stats function (staff-only via orders_cache RLS)
CREATE OR REPLACE FUNCTION public.customer_order_stats(emails TEXT[])
RETURNS TABLE(email TEXT, total BIGINT, completed BIGINT, cancelled BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    lower(customer_email)                                             AS email,
    count(*)::bigint                                                  AS total,
    count(*) FILTER (WHERE status = 'completed')::bigint              AS completed,
    count(*) FILTER (WHERE status IN ('cancelled','failed','refunded'))::bigint AS cancelled
  FROM public.orders_cache
  WHERE customer_email IS NOT NULL
    AND lower(customer_email) = ANY (SELECT lower(e) FROM unnest(emails) AS e)
  GROUP BY lower(customer_email)
$$;

GRANT EXECUTE ON FUNCTION public.customer_order_stats(TEXT[]) TO authenticated;
