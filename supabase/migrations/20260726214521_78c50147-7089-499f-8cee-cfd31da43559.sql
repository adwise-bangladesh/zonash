
CREATE TABLE public.blocked_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('phone','email','ip','fingerprint')),
  value TEXT NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX blocked_identities_kind_value_idx
  ON public.blocked_identities (kind, lower(value));

CREATE INDEX blocked_identities_value_idx
  ON public.blocked_identities (lower(value));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_identities TO authenticated;
GRANT ALL ON public.blocked_identities TO service_role;

ALTER TABLE public.blocked_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view blocks"
  ON public.blocked_identities FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can add blocks"
  ON public.blocked_identities FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can update blocks"
  ON public.blocked_identities FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can delete blocks"
  ON public.blocked_identities FOR DELETE TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));
