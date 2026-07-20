
CREATE TABLE public.police_stations (
  id BIGSERIAL PRIMARY KEY,
  district_id INTEGER NOT NULL,
  district_name TEXT NOT NULL,
  name TEXT NOT NULL,
  is_dhaka_city BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (district_id, name)
);

CREATE INDEX idx_police_stations_district ON public.police_stations(district_id);
CREATE INDEX idx_police_stations_name_lower ON public.police_stations(lower(name));

GRANT SELECT ON public.police_stations TO anon, authenticated;
GRANT ALL ON public.police_stations TO service_role;

ALTER TABLE public.police_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read police stations"
  ON public.police_stations FOR SELECT
  TO anon, authenticated
  USING (true);
