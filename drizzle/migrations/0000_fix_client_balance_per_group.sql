CREATE OR REPLACE FUNCTION public.get_client_balance(p_client_id uuid)
 RETURNS TABLE(total_insurance numeric, total_paid numeric, total_refunds numeric, total_remaining numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH active_policies AS (
    SELECT p.id,
           p.group_id,
           p.policy_type_parent,
           COALESCE(p.insurance_price, 0) + COALESCE(p.office_commission, 0) AS price
    FROM policies p
    WHERE p.client_id = p_client_id
      AND COALESCE(p.cancelled, FALSE) = FALSE
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
  ),
  pay AS (
    SELECT pp.policy_id, COALESCE(SUM(pp.amount), 0) AS amt
    FROM policy_payments pp
    JOIN active_policies ap ON ap.id = pp.policy_id
    WHERE COALESCE(pp.refused, FALSE) = FALSE
    GROUP BY pp.policy_id
  ),
  policy_totals AS (
    SELECT COALESCE(SUM(price), 0) AS total_ins FROM active_policies
  ),
  payment_totals AS (
    SELECT COALESCE(SUM(amt), 0) AS total_pay FROM pay
  ),
  wallet_totals AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('refund', 'transfer_refund_owed', 'manual_refund') THEN amount
        WHEN transaction_type = 'transfer_adjustment_due' THEN -amount
        ELSE 0
      END
    ), 0) AS total_ref
    FROM customer_wallet_transactions
    WHERE client_id = p_client_id
  ),
  -- Package (group) level debt: never let an overpaid package cancel another package's debt
  group_debts AS (
    SELECT GREATEST(0, LEAST(
      SUM(CASE WHEN ap.policy_type_parent <> 'ELZAMI' THEN ap.price ELSE 0 END),
      SUM(ap.price) - COALESCE(SUM(pay.amt), 0)
    )) AS rem
    FROM active_policies ap
    LEFT JOIN pay ON pay.policy_id = ap.id
    WHERE ap.group_id IS NOT NULL
    GROUP BY ap.group_id
  ),
  standalone_debts AS (
    SELECT GREATEST(0, ap.price - COALESCE(pay.amt, 0)) AS rem
    FROM active_policies ap
    LEFT JOIN pay ON pay.policy_id = ap.id
    WHERE ap.group_id IS NULL
      AND ap.policy_type_parent <> 'ELZAMI'
  ),
  remaining_total AS (
    SELECT COALESCE((SELECT SUM(rem) FROM group_debts), 0)
         + COALESCE((SELECT SUM(rem) FROM standalone_debts), 0) AS rem
  )
  SELECT
    pt.total_ins::numeric,
    pay2.total_pay::numeric,
    wt.total_ref::numeric,
    GREATEST(0, rt.rem - GREATEST(wt.total_ref, 0))::numeric
  FROM policy_totals pt
  CROSS JOIN payment_totals pay2
  CROSS JOIN wallet_totals wt
  CROSS JOIN remaining_total rt;
END;
$function$;