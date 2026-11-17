ALTER FUNCTION public.report_renewed_clients(text,text,uuid,text,int4,int4) SET search_path = public;
ALTER FUNCTION public.report_renewals(date,date,text,uuid,text,int4,int4) SET search_path = public;
ALTER FUNCTION public.report_renewals_service(date,text,int4,int4,int4) SET search_path = public;

DROP POLICY IF EXISTS "Authenticated users can read xservice_sync_log" ON public.xservice_sync_log;
CREATE POLICY "Active users can read xservice_sync_log" ON public.xservice_sync_log FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;

DROP POLICY IF EXISTS "Authenticated users can view announcements" ON public.announcements;
CREATE POLICY "Super admin can view all announcements" ON public.announcements FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can read site settings" ON public.site_settings;
CREATE POLICY "Public can read site branding" ON public.site_settings FOR SELECT TO anon, authenticated USING (id IS NOT NULL);