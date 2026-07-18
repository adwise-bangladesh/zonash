
-- Trigger-only functions: no client should call them.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- RLS helpers: must be callable by authenticated (used inside policies),
-- but not by anonymous callers.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_staff_or_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin(uuid) TO authenticated;

-- webhook_events: service-role only. Deny-all policy makes the intent explicit
-- for the linter (service_role bypasses RLS anyway).
CREATE POLICY "webhook_events: deny all to non-service" ON public.webhook_events
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
