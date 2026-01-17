-- Update clear function and add post-import fix function

-- 1. Update clear_data_for_import to be called before import
CREATE OR REPLACE FUNCTION public.clear_data_for_import()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_count integer;
BEGIN
  -- Disable triggers temporarily
  SET session_replication_role = replica;

  -- DELETE order matters due to foreign keys (children first, then parents)
  
  -- 1. Delete ledger entries
  DELETE FROM ab_ledger;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('ab_ledger', v_count);

  -- 2. Delete broker settlement items
  DELETE FROM broker_settlement_items;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('broker_settlement_items', v_count);

  -- 3. Delete broker settlements (broker wallet)
  DELETE FROM broker_settlements;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('broker_settlements', v_count);

  -- 4. Delete company settlements (company wallet)
  DELETE FROM company_settlements;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('company_settlements', v_count);

  -- 5. Delete customer wallet transactions
  DELETE FROM customer_wallet_transactions;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('customer_wallet_transactions', v_count);

  -- 6. Delete payment images
  DELETE FROM payment_images;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('payment_images', v_count);

  -- 7. Delete policy payments (cheques)
  DELETE FROM policy_payments;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('policy_payments', v_count);

  -- 8. Delete outside cheques
  DELETE FROM outside_cheques;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('outside_cheques', v_count);

  -- 9. Delete invoices
  DELETE FROM invoices;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('invoices', v_count);

  -- 10. Delete policy reminders
  DELETE FROM policy_reminders;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('policy_reminders', v_count);

  -- 11. Delete policy renewal tracking
  DELETE FROM policy_renewal_tracking;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('policy_renewal_tracking', v_count);

  -- 12. Delete policy transfers
  DELETE FROM policy_transfers;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('policy_transfers', v_count);

  -- 13. Delete customer signatures
  DELETE FROM customer_signatures;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('customer_signatures', v_count);

  -- 14. Delete accident third parties
  DELETE FROM accident_third_parties;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('accident_third_parties', v_count);

  -- 15. Delete accident reports
  DELETE FROM accident_reports;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('accident_reports', v_count);

  -- 16. Delete policies
  DELETE FROM policies;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('policies', v_count);

  -- 17. Delete policy groups
  DELETE FROM policy_groups;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('policy_groups', v_count);

  -- 18. Delete car accidents
  DELETE FROM car_accidents;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('car_accidents', v_count);

  -- 19. Delete cars
  DELETE FROM cars;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cars', v_count);

  -- 20. Delete marketing SMS recipients
  DELETE FROM marketing_sms_recipients;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('marketing_sms_recipients', v_count);

  -- 21. Delete marketing SMS campaigns
  DELETE FROM marketing_sms_campaigns;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('marketing_sms_campaigns', v_count);

  -- 22. Delete automated SMS log
  DELETE FROM automated_sms_log;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('automated_sms_log', v_count);

  -- 23. Delete SMS logs
  DELETE FROM sms_logs;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('sms_logs', v_count);

  -- 24. Delete clients
  DELETE FROM clients;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('clients', v_count);

  -- 25. Delete brokers
  DELETE FROM brokers;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('brokers', v_count);

  -- 26. Delete media files (gallery)
  DELETE FROM media_files;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('media_files', v_count);

  -- 27. Delete import progress
  DELETE FROM import_progress;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('import_progress', v_count);

  -- 28. Delete expenses
  DELETE FROM expenses;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('expenses', v_count);

  -- Re-enable triggers
  SET session_replication_role = DEFAULT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_result,
    'preserved', ARRAY[
      'insurance_companies',
      'pricing_rules', 
      'branches',
      'profiles',
      'user_roles',
      'notifications',
      'announcements',
      'auth_settings',
      'payment_settings',
      'invoice_templates',
      'sms_settings',
      'insurance_categories',
      'road_services',
      'accident_fee_services',
      'company_road_service_prices',
      'company_accident_fee_prices',
      'company_accident_templates',
      'insurance_company_groups'
    ]
  );
END;
$$;

-- 2. Create function to fix service policies without company (assign to شركة اكس)
CREATE OR REPLACE FUNCTION public.fix_service_policies_company()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_x_id uuid := '0014273c-78fc-4945-920c-6c8ce653f64a'; -- شركة اكس
  v_road_count integer;
  v_accident_count integer;
BEGIN
  -- Update ROAD_SERVICE policies without company
  UPDATE policies
  SET company_id = v_company_x_id
  WHERE policy_type_parent = 'ROAD_SERVICE'
    AND (company_id IS NULL OR company_id NOT IN (SELECT id FROM insurance_companies));
  GET DIAGNOSTICS v_road_count = ROW_COUNT;

  -- Update ACCIDENT_FEE_EXEMPTION policies without company
  UPDATE policies
  SET company_id = v_company_x_id
  WHERE policy_type_parent = 'ACCIDENT_FEE_EXEMPTION'
    AND (company_id IS NULL OR company_id NOT IN (SELECT id FROM insurance_companies));
  GET DIAGNOSTICS v_accident_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'company_x_id', v_company_x_id,
    'road_service_fixed', v_road_count,
    'accident_fee_fixed', v_accident_count
  );
END;
$$;