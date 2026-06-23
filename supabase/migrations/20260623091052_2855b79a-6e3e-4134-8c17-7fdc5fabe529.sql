
-- accident_injured_persons SELECT: require active user
DROP POLICY IF EXISTS "Users can view injured persons for their reports" ON public.accident_injured_persons;
DROP POLICY IF EXISTS "Users can view accident injured persons" ON public.accident_injured_persons;
CREATE POLICY "Active users can view injured persons"
ON public.accident_injured_persons FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND EXISTS (SELECT 1 FROM public.accident_reports ar WHERE ar.id = accident_injured_persons.accident_report_id)
);

-- accident_report_files: gate all with is_active_user
DROP POLICY IF EXISTS "Authenticated users can view accident report files" ON public.accident_report_files;
DROP POLICY IF EXISTS "Authenticated users can insert accident report files" ON public.accident_report_files;
DROP POLICY IF EXISTS "Authenticated users can update accident report files" ON public.accident_report_files;
DROP POLICY IF EXISTS "Authenticated users can delete accident report files" ON public.accident_report_files;
CREATE POLICY "Active users can view accident report files" ON public.accident_report_files
FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can insert accident report files" ON public.accident_report_files
FOR INSERT TO authenticated WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can update accident report files" ON public.accident_report_files
FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can delete accident report files" ON public.accident_report_files
FOR DELETE TO authenticated USING (public.is_active_user(auth.uid()));

-- accident_report_notes
DROP POLICY IF EXISTS "Authenticated users can view accident report notes" ON public.accident_report_notes;
DROP POLICY IF EXISTS "Authenticated users can insert accident report notes" ON public.accident_report_notes;
DROP POLICY IF EXISTS "Authenticated users can update accident report notes" ON public.accident_report_notes;
DROP POLICY IF EXISTS "Authenticated users can delete accident report notes" ON public.accident_report_notes;
CREATE POLICY "Active users can view accident report notes" ON public.accident_report_notes
FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can insert accident report notes" ON public.accident_report_notes
FOR INSERT TO authenticated WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can update accident report notes" ON public.accident_report_notes
FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can delete accident report notes" ON public.accident_report_notes
FOR DELETE TO authenticated USING (public.is_active_user(auth.uid()));

-- accident_report_reminders
DROP POLICY IF EXISTS "Authenticated users can view accident report reminders" ON public.accident_report_reminders;
DROP POLICY IF EXISTS "Authenticated users can insert accident report reminders" ON public.accident_report_reminders;
DROP POLICY IF EXISTS "Authenticated users can update accident report reminders" ON public.accident_report_reminders;
DROP POLICY IF EXISTS "Authenticated users can delete accident report reminders" ON public.accident_report_reminders;
CREATE POLICY "Active users can view accident report reminders" ON public.accident_report_reminders
FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can insert accident report reminders" ON public.accident_report_reminders
FOR INSERT TO authenticated WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can update accident report reminders" ON public.accident_report_reminders
FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can delete accident report reminders" ON public.accident_report_reminders
FOR DELETE TO authenticated USING (public.is_active_user(auth.uid()));

-- notifications INSERT: restrict to service role (edge functions). Active users can still insert for themselves.
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;
CREATE POLICY "Active users can insert own notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (public.is_active_user(auth.uid()) AND user_id = auth.uid());

-- policy_reminders INSERT: gate with active user
DROP POLICY IF EXISTS "Service can insert policy reminders" ON public.policy_reminders;
CREATE POLICY "Active users can insert policy reminders" ON public.policy_reminders
FOR INSERT TO authenticated
WITH CHECK (public.is_active_user(auth.uid()));

-- xservice_sync_log: lock INSERT/UPDATE to active users (edge functions use service role and bypass RLS)
DROP POLICY IF EXISTS "Service role can insert xservice_sync_log" ON public.xservice_sync_log;
DROP POLICY IF EXISTS "Service role can update xservice_sync_log" ON public.xservice_sync_log;
CREATE POLICY "Active users can insert xservice_sync_log" ON public.xservice_sync_log
FOR INSERT TO authenticated WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can update xservice_sync_log" ON public.xservice_sync_log
FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));

-- branding bucket: restrict writes to admins; keep public read (logos etc.)
DROP POLICY IF EXISTS "Authenticated can upload branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete branding" ON storage.objects;
CREATE POLICY "Admins can upload branding" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'branding' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));
CREATE POLICY "Admins can update branding" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'branding' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())))
WITH CHECK (bucket_id = 'branding' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));
CREATE POLICY "Admins can delete branding" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'branding' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));
