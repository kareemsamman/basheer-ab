
CREATE OR REPLACE FUNCTION public.admin_delete_policy_payments(p_policy_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Disable triggers that block unlock/delete
  ALTER TABLE policy_payments DISABLE TRIGGER trg_validate_policy_payment_total;
  ALTER TABLE policy_payments DISABLE TRIGGER trg_prevent_locked_delete;
  
  -- Delete all payments for these policies
  DELETE FROM policy_payments WHERE policy_id = ANY(p_policy_ids);
  
  -- Re-enable triggers
  ALTER TABLE policy_payments ENABLE TRIGGER trg_validate_policy_payment_total;
  ALTER TABLE policy_payments ENABLE TRIGGER trg_prevent_locked_delete;
END;
$$;
