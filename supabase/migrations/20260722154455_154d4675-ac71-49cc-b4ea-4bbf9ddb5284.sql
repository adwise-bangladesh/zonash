
CREATE TABLE IF NOT EXISTS public.server_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS server_error_log_created_at_idx
  ON public.server_error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS server_error_log_scope_idx
  ON public.server_error_log (scope, created_at DESC);

GRANT SELECT ON public.server_error_log TO authenticated;
GRANT ALL ON public.server_error_log TO service_role;

ALTER TABLE public.server_error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read error log" ON public.server_error_log;
CREATE POLICY "Staff can read error log"
  ON public.server_error_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
    OR public.has_role(auth.uid(), 'viewer')
  );
