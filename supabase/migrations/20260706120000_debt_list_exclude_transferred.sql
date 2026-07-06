-- Debt list: exclude transferred policies
-- report_debt_policies_for_clients feeds the debts-list totals/counts that
-- DebtTracking.tsx recomputes client-side. Unlike get_client_balance,
-- report_client_debts and DebtPaymentModal, it never filtered out
-- transferred = true policies, so the list over-counted a client's debt
-- (e.g. amل ابو عودة showed ₪2,050 while her page/payment modal showed ₪450).
-- Add the same `transferred = false` guard used by the rest of the system to
-- every policy scan in this function.

CREATE OR REPLACE FUNCTION report_debt_policies_for_clients(p_client_ids uuid[])
RETURNS TABLE(
  client_id uuid,
  policy_id uuid,
  policy_number text,
  insurance_price numeric,
  paid numeric,
  remaining numeric,
  end_date date,
  days_until_expiry integer,
  status text,
  policy_type_parent text,
  policy_type_child text,
  car_number text,
  group_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_active_user(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH policy_payments_agg AS (
    SELECT
      pp.policy_id,
      SUM(pp.amount) AS total_paid
    FROM policy_payments pp
    WHERE pp.refused IS NOT TRUE
    GROUP BY pp.policy_id
  ),
  -- السعر الكلي للباقة
  group_full_prices AS (
    SELECT
      p.group_id,
      SUM(COALESCE(p.insurance_price, 0)) AS full_price
    FROM policies p
    WHERE p.group_id IS NOT NULL
      AND p.client_id = ANY(p_client_ids)
      AND p.cancelled = false
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
    GROUP BY p.group_id
  ),
  -- سعر غير الإلزامي
  group_non_elzami_prices AS (
    SELECT
      p.group_id,
      SUM(COALESCE(p.insurance_price, 0)) AS non_elzami_price
    FROM policies p
    WHERE p.group_id IS NOT NULL
      AND p.policy_type_parent <> 'ELZAMI'
      AND p.client_id = ANY(p_client_ids)
      AND p.cancelled = false
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
    GROUP BY p.group_id
  ),
  -- المدفوعات
  group_payments AS (
    SELECT
      p.group_id,
      COALESCE(SUM(ppa.total_paid), 0) AS group_paid
    FROM policies p
    LEFT JOIN policy_payments_agg ppa ON ppa.policy_id = p.id
    WHERE p.group_id IS NOT NULL
      AND p.client_id = ANY(p_client_ids)
      AND p.cancelled = false
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
    GROUP BY p.group_id
  ),
  group_totals AS (
    SELECT
      gfp.group_id,
      gfp.full_price,
      COALESCE(gnp.non_elzami_price, 0) AS non_elzami_price,
      COALESCE(gpa.group_paid, 0) AS group_paid,
      -- المتبقي الصحيح = min(non_elzami, full - paid)
      GREATEST(0, LEAST(
        COALESCE(gnp.non_elzami_price, 0),
        gfp.full_price - COALESCE(gpa.group_paid, 0)
      )) AS group_remaining
    FROM group_full_prices gfp
    LEFT JOIN group_non_elzami_prices gnp ON gnp.group_id = gfp.group_id
    LEFT JOIN group_payments gpa ON gpa.group_id = gfp.group_id
  )
  -- Packages: distribute remaining proportionally among non-ELZAMI policies
  SELECT
    p.client_id,
    p.id AS policy_id,
    p.policy_number,
    p.insurance_price,
    -- Proportional paid
    CASE
      WHEN gt.non_elzami_price > 0 AND p.policy_type_parent <> 'ELZAMI' THEN
        ROUND((COALESCE(p.insurance_price, 0) / gt.non_elzami_price) * (gt.non_elzami_price - gt.group_remaining), 2)
      WHEN p.policy_type_parent = 'ELZAMI' THEN COALESCE(p.insurance_price, 0)
      ELSE 0
    END AS paid,
    -- Proportional remaining (only for non-ELZAMI)
    CASE
      WHEN gt.non_elzami_price > 0 AND p.policy_type_parent <> 'ELZAMI' THEN
        ROUND((COALESCE(p.insurance_price, 0) / gt.non_elzami_price) * gt.group_remaining, 2)
      ELSE 0
    END AS remaining,
    p.end_date,
    (p.end_date - CURRENT_DATE)::integer AS days_until_expiry,
    CASE
      WHEN p.cancelled = true THEN 'cancelled'
      WHEN p.end_date < CURRENT_DATE THEN 'expired'
      ELSE 'active'
    END AS status,
    p.policy_type_parent::text,
    p.policy_type_child::text,
    car.car_number,
    p.group_id
  FROM policies p
  INNER JOIN group_totals gt ON gt.group_id = p.group_id
  LEFT JOIN cars car ON car.id = p.car_id
  WHERE p.client_id = ANY(p_client_ids)
    AND p.cancelled = false
    AND COALESCE(p.transferred, FALSE) = FALSE
    AND p.deleted_at IS NULL
    AND p.broker_id IS NULL
    AND gt.group_remaining > 0

  UNION ALL

  -- Single policies (no group)
  SELECT
    p.client_id,
    p.id AS policy_id,
    p.policy_number,
    p.insurance_price,
    COALESCE(ppa.total_paid, 0) AS paid,
    GREATEST(0, COALESCE(p.insurance_price, 0) - COALESCE(ppa.total_paid, 0)) AS remaining,
    p.end_date,
    (p.end_date - CURRENT_DATE)::integer AS days_until_expiry,
    CASE
      WHEN p.cancelled = true THEN 'cancelled'
      WHEN p.end_date < CURRENT_DATE THEN 'expired'
      ELSE 'active'
    END AS status,
    p.policy_type_parent::text,
    p.policy_type_child::text,
    car.car_number,
    p.group_id
  FROM policies p
  LEFT JOIN policy_payments_agg ppa ON ppa.policy_id = p.id
  LEFT JOIN cars car ON car.id = p.car_id
  WHERE p.client_id = ANY(p_client_ids)
    AND p.group_id IS NULL
    AND p.policy_type_parent <> 'ELZAMI'
    AND p.cancelled = false
    AND COALESCE(p.transferred, FALSE) = FALSE
    AND p.deleted_at IS NULL
    AND p.broker_id IS NULL
    AND COALESCE(p.insurance_price, 0) - COALESCE(ppa.total_paid, 0) > 0
  ORDER BY remaining DESC;
END;
$function$;
