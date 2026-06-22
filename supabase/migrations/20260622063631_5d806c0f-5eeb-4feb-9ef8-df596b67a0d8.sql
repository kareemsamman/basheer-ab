
-- accident_injured_persons: require active user on writes
DROP POLICY IF EXISTS "Users can insert injured persons for accessible accident report" ON public.accident_injured_persons;
DROP POLICY IF EXISTS "Users can update injured persons for accessible accident report" ON public.accident_injured_persons;
DROP POLICY IF EXISTS "Users can delete injured persons for accessible accident report" ON public.accident_injured_persons;

CREATE POLICY "Active users can insert injured persons"
ON public.accident_injured_persons FOR INSERT TO authenticated
WITH CHECK (public.is_active_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.accident_reports ar WHERE ar.id = accident_report_id));

CREATE POLICY "Active users can update injured persons"
ON public.accident_injured_persons FOR UPDATE TO authenticated
USING (public.is_active_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.accident_reports ar WHERE ar.id = accident_report_id))
WITH CHECK (public.is_active_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.accident_reports ar WHERE ar.id = accident_report_id));

CREATE POLICY "Active users can delete injured persons"
ON public.accident_injured_persons FOR DELETE TO authenticated
USING (public.is_active_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.accident_reports ar WHERE ar.id = accident_report_id));

-- client_debits
DROP POLICY IF EXISTS "Authenticated users can view client_debits" ON public.client_debits;
DROP POLICY IF EXISTS "Authenticated users can insert client_debits" ON public.client_debits;
DROP POLICY IF EXISTS "Authenticated users can update client_debits" ON public.client_debits;
DROP POLICY IF EXISTS "Authenticated users can delete client_debits" ON public.client_debits;

CREATE POLICY "Active users can view client_debits" ON public.client_debits FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can insert client_debits" ON public.client_debits FOR INSERT TO authenticated WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can update client_debits" ON public.client_debits FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can delete client_debits" ON public.client_debits FOR DELETE TO authenticated USING (public.is_active_user(auth.uid()));

-- client_payments
DROP POLICY IF EXISTS "Authenticated users can view client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Authenticated users can insert client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Authenticated users can update client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Authenticated users can delete client_payments" ON public.client_payments;

CREATE POLICY "Active users can view client_payments" ON public.client_payments FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can insert client_payments" ON public.client_payments FOR INSERT TO authenticated WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can update client_payments" ON public.client_payments FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can delete client_payments" ON public.client_payments FOR DELETE TO authenticated USING (public.is_active_user(auth.uid()));

-- receipts (fix public role on UPDATE + tighten select/insert)
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can insert receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can delete manual receipts" ON public.receipts;

CREATE POLICY "Active users can view receipts" ON public.receipts FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can insert receipts" ON public.receipts FOR INSERT TO authenticated WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can update receipts" ON public.receipts FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));
CREATE POLICY "Active users can delete manual receipts" ON public.receipts FOR DELETE TO authenticated USING (public.is_active_user(auth.uid()) AND source = 'manual');

-- repair_claims
DROP POLICY IF EXISTS "Authenticated users can manage repair claims" ON public.repair_claims;
CREATE POLICY "Active users can manage repair claims" ON public.repair_claims FOR ALL TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));

-- repair_claim_notes
DROP POLICY IF EXISTS "Authenticated users can manage repair claim notes" ON public.repair_claim_notes;
CREATE POLICY "Active users can manage repair claim notes" ON public.repair_claim_notes FOR ALL TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));

-- repair_claim_reminders
DROP POLICY IF EXISTS "Authenticated users can manage repair claim reminders" ON public.repair_claim_reminders;
CREATE POLICY "Active users can manage repair claim reminders" ON public.repair_claim_reminders FOR ALL TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));

-- settlement_supplements: admin only
DROP POLICY IF EXISTS "Authenticated users can manage supplements" ON public.settlement_supplements;
CREATE POLICY "Admins can manage supplements" ON public.settlement_supplements FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- workers: admin only
DROP POLICY IF EXISTS "authenticated_workers_all" ON public.workers;
CREATE POLICY "Admins can manage workers" ON public.workers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- worker_salaries: admin only
DROP POLICY IF EXISTS "authenticated_worker_salaries_all" ON public.worker_salaries;
CREATE POLICY "Admins can manage worker_salaries" ON public.worker_salaries FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- site_settings: admin only UPDATE
DROP POLICY IF EXISTS "Authenticated users can update site settings" ON public.site_settings;
CREATE POLICY "Admins can update site settings" ON public.site_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- xservice_settings: admin only SELECT (keeps API key away from regular workers)
DROP POLICY IF EXISTS "Authenticated users can read xservice_settings" ON public.xservice_settings;
CREATE POLICY "Admins can read xservice_settings" ON public.xservice_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
