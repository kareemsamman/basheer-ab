-- Exclude entire broker groups from client debt calculations
-- A broker package may have broker_id only on the main policy,
-- but the entire group should be excluded from customer debt tracking.

CREATE OR REPLACE FUNCTION get_client_balance(p_client_id uuid)
RETURNS TABLE(
  total_insurance numeric,
  total_paid numeric,
  total_refunds numeric,
  total_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Find all group_ids where ANY policy has a broker_id
  broker_groups AS (
    SELECT DISTINCT group_id
    FROM policies
    WHERE client_id = p_client_id
      AND broker_id IS NOT NULL
      AND group_id IS NOT NULL
  ),
  -- All active policies (INCLUDING ELZAMI, EXCLUDING broker deals AND broker groups)
  active_policies AS (
    SELECT p.id, COALESCE(p.insurance_price, 0) AS insurance_price
    FROM policies p
    WHERE p.client_id = p_client_id
      AND COALESCE(p.cancelled, FALSE) = FALSE
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
      AND (p.group_id IS NULL OR p.group_id NOT IN (SELECT group_id FROM broker_groups))
  ),
  policy_totals AS (
    SELECT COALESCE(SUM(insurance_price), 0) AS total_ins
    FROM active_policies
  ),
  payment_totals AS (
    SELECT COALESCE(SUM(pp.amount), 0) AS total_pay
    FROM policy_payments pp
    JOIN active_policies ap ON ap.id = pp.policy_id
    WHERE COALESCE(pp.refused, FALSE) = FALSE
  ),
  wallet_totals AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('refund', 'transfer_refund_owed', 'manual_refund')
        THEN amount
        WHEN transaction_type = 'transfer_adjustment_due'
        THEN -amount
        ELSE 0
      END
    ), 0) AS total_ref
    FROM customer_wallet_transactions
    WHERE client_id = p_client_id
  )
  SELECT
    pt.total_ins::numeric AS total_insurance,
    pay.total_pay::numeric AS total_paid,
    wt.total_ref::numeric AS total_refunds,
    GREATEST(0, pt.total_ins - pay.total_pay - wt.total_ref)::numeric AS total_remaining
  FROM policy_totals pt
  CROSS JOIN payment_totals pay
  CROSS JOIN wallet_totals wt;
END;
$$;
