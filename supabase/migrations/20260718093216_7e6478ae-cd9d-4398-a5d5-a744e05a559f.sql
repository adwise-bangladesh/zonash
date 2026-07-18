
CREATE OR REPLACE FUNCTION public.orders_cache_status_counts()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT status, count(*)::bigint
  FROM public.orders_cache
  GROUP BY status
$$;
