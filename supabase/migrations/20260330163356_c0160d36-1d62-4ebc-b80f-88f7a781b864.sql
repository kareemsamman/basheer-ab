
CREATE OR REPLACE FUNCTION public.admin_delete_policy_payments(p_policy_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Disable validation trigger that blocks updates when total > price
  ALTER TABLE policy_payments DISABLE TRIGGER trg_validate_policy_payment_total;
  
  -- Unlock locked payments first, then delete all
  UPDATE policy_payments SET locked = false WHERE policy_id = ANY(p_policy_ids) AND locked = true;
  DELETE FROM policy_payments WHERE policy_id = ANY(p_policy_ids);
  
  -- Re-enable trigger
  ALTER TABLE policy_payments ENABLE TRIGGER trg_validate_policy_payment_total;
END;
$$;
