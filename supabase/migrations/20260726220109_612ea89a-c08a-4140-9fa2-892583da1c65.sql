DROP INDEX IF EXISTS public.blocked_identities_kind_value_idx;
ALTER TABLE public.blocked_identities
  ADD CONSTRAINT blocked_identities_kind_value_key UNIQUE (kind, value);