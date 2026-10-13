CREATE OR REPLACE FUNCTION public.is_tranzila_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_enabled FROM public.payment_settings WHERE provider='tranzila' LIMIT 1), false)
  WHERE public.is_active_user(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_tranzila_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tranzila_enabled() TO authenticated;