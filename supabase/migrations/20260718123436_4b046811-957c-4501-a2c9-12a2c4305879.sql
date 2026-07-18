CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('note','sms')),
  title text NOT NULL,
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read templates"
  ON public.message_templates FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can insert templates"
  ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can update templates"
  ON public.message_templates FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can delete templates"
  ON public.message_templates FOR DELETE TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_message_templates_kind_sort
  ON public.message_templates(kind, sort_order, title);

-- Seed a few starter templates so the picker isn't empty on first use.
INSERT INTO public.message_templates (kind, title, body, sort_order) VALUES
  ('sms', 'Order confirmed', 'Assalamualaikum, apnar order Zonash theke confirm kora hoyeche. Dhonnobad!', 10),
  ('sms', 'Please confirm order', 'Zonash: apnar order confirm korte please ei number e reply korun ba amader call korun.', 20),
  ('sms', 'Out for delivery', 'Zonash: apnar parcel courier e disha hoyeche. Dhonnobad!', 30),
  ('sms', 'Delivery attempt failed', 'Zonash: courier apnake pele na. Please amader sathe jogajog korun.', 40),
  ('note', 'Customer unreachable', 'Called customer, phone off/unreachable. Retry later.', 10),
  ('note', 'Address unclear', 'Address is incomplete — need thana/landmark.', 20),
  ('note', 'Fake / abusive customer', 'Customer previously cancelled multiple orders. Verify before shipping.', 30);
