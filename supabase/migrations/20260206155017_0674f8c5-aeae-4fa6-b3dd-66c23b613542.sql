-- Update the get_client_balance RPC to use client_payments table instead of policy_payments
-- This implements the wallet-centric approach where payments are tracked at client level

CREATE OR REPLACE FUNCTION get_client_balance(p_client_id UUID)
RETURNS TABLE(
  total_insurance NUMERIC,
  total_paid NUMERIC,
  total_refunds NUMERIC,
  total_remaining NUMERIC
)
AS $$
BEGIN
  RETURN QUERY
  WITH policy_totals AS (
    SELECT COALESCE(SUM(insurance_price), 0) as total_ins
    FROM policies
    WHERE client_id = p_client_id
      AND cancelled = false
      AND transferred = false
      AND deleted_at IS NULL
      AND broker_id IS NULL
  ),
  payment_totals AS (
    -- Now using client_payments table (wallet-centric)
    SELECT COALESCE(SUM(amount), 0) as total_pay
    FROM client_payments
    WHERE client_id = p_client_id
      AND (refused IS NULL OR refused = false)
  ),
  refund_totals AS (
    SELECT COALESCE(SUM(amount), 0) as total_ref
    FROM customer_wallet_transactions
    WHERE client_id = p_client_id
      AND transaction_type IN ('refund', 'transfer_refund_owed', 'manual_refund')
  )
  SELECT 
    pt.total_ins,
    pay.total_pay,
    ref.total_ref,
    GREATEST(0, pt.total_ins - pay.total_pay - ref.total_ref)
  FROM policy_totals pt, payment_totals pay, refund_totals ref;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Add indexes for better performance on client_payments
CREATE INDEX IF NOT EXISTS idx_client_payments_client_lookup 
ON client_payments(client_id, refused);

CREATE INDEX IF NOT EXISTS idx_client_payments_date 
ON client_payments(payment_date DESC);