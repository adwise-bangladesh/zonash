
CREATE TABLE IF NOT EXISTS public.customer_history (
  phone TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_history TO authenticated;
GRANT ALL ON public.customer_history TO service_role;

ALTER TABLE public.customer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read customer history"
  ON public.customer_history FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can upsert customer history"
  ON public.customer_history FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can update customer history"
  ON public.customer_history FOR UPDATE
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_customer_history_updated_at
  ON public.customer_history (updated_at DESC);
