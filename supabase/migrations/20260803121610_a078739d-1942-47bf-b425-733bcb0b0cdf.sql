CREATE TABLE IF NOT EXISTS public.site_assets (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.site_assets TO service_role;

ALTER TABLE public.site_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_assets_no_client_access"
  ON public.site_assets
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);