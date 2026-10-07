-- One debt rule for the whole system (debt list, client page, dashboard,
-- debt badge, debt SMS).
--
-- * Netted per client: an overpaid package offsets debt in the client's other
--   packages. Counting each package on its own (17/09) showed clients who had
--   paid in full as owing, because their payment was recorded on another
--   package of theirs.
-- * Broker deals are excluded as whole packages again. A broker package can
--   have broker_id only on its main policy; since 17/09 its add-ons (e.g. road
--   service) were counted as client debt while the debt list page hid them.
-- * Unpaid ELZAMI is never office debt: a package owes at most its non-ELZAMI
--   part (unchanged).
-- * Office commission is part of what the client owes (unchanged in
--   get_client_balance; now also in the per-policy breakdown).

CREATE OR REPLACE FUNCTION public.get_client_debt(p_client_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH broker_groups AS (
    SELECT DISTINCT group_id
    FROM policies
    WHERE client_id = p_client_id
      AND broker_id IS NOT NULL
      AND group_id IS NOT NULL
  ),
  active_policies AS (
    SELECT p.id,
           COALESCE(p.group_id, p.id) AS package_id,
           p.policy_type_parent,
           COALESCE(p.insurance_price, 0) + COALESCE(p.office_commission, 0) AS price
    FROM policies p
    WHERE p.client_id = p_client_id
      AND COALESCE(p.cancelled, FALSE) = FALSE
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
      AND (p.group_id IS NULL OR p.group_id NOT IN (SELECT group_id FROM broker_groups))
  ),
  pay AS (
    SELECT pp.policy_id, SUM(pp.amount) AS amt
    FROM policy_payments pp
    JOIN active_policies ap ON ap.id = pp.policy_id
    WHERE COALESCE(pp.refused, FALSE) = FALSE
    GROUP BY pp.policy_id
  ),
  packages AS (
    -- Negative when the package is overpaid
    SELECT LEAST(
      SUM(CASE WHEN ap.policy_type_parent <> 'ELZAMI' THEN ap.price ELSE 0 END),
      SUM(ap.price) - COALESCE(SUM(pay.amt), 0)
    ) AS net
    FROM active_policies ap
    LEFT JOIN pay ON pay.policy_id = ap.id
    GROUP BY ap.package_id
  )
  SELECT GREATEST(0, COALESCE(SUM(net), 0)) FROM packages;
$function$;

REVOKE ALL ON FUNCTION public.get_client_debt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_debt(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_client_balance(p_client_id uuid)
 RETURNS TABLE(total_insurance numeric, total_paid numeric, total_refunds numeric, total_remaining numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH broker_groups AS (
    SELECT DISTINCT group_id
    FROM policies
    WHERE client_id = p_client_id
      AND broker_id IS NOT NULL
      AND group_id IS NOT NULL
  ),
  active_policies AS (
    SELECT p.id,
           COALESCE(p.insurance_price, 0) + COALESCE(p.office_commission, 0) AS price
    FROM policies p
    WHERE p.client_id = p_client_id
      AND COALESCE(p.cancelled, FALSE) = FALSE
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
      AND (p.group_id IS NULL OR p.group_id NOT IN (SELECT group_id FROM broker_groups))
  ),
  policy_totals AS (
    SELECT COALESCE(SUM(price), 0) AS total_ins FROM active_policies
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
        WHEN transaction_type IN ('refund', 'transfer_refund_owed', 'manual_refund') THEN amount
        WHEN transaction_type = 'transfer_adjustment_due' THEN -amount
        ELSE 0
      END
    ), 0) AS total_ref
    FROM customer_wallet_transactions
    WHERE client_id = p_client_id
  )
  SELECT
    pt.total_ins::numeric,
    pay.total_pay::numeric,
    wt.total_ref::numeric,
    GREATEST(0, get_client_debt(p_client_id) - GREATEST(wt.total_ref, 0))::numeric
  FROM policy_totals pt
  CROSS JOIN payment_totals pay
  CROSS JOIN wallet_totals wt;
END;
$function$;

-- Per-policy breakdown shown under each client in the debt list and in debt SMS.
-- Same policy set and prices as get_client_debt (broker packages excluded,
-- office commission included). Packages are listed with their own remaining;
-- the client's total comes from get_client_balance.
CREATE OR REPLACE FUNCTION public.report_debt_policies_for_clients(p_client_ids uuid[])
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
  WITH broker_groups AS (
    SELECT DISTINCT p.group_id
    FROM policies p
    WHERE p.client_id = ANY(p_client_ids)
      AND p.broker_id IS NOT NULL
      AND p.group_id IS NOT NULL
  ),
  active_policies AS (
    SELECT p.*,
           COALESCE(p.insurance_price, 0) + COALESCE(p.office_commission, 0) AS price
    FROM policies p
    WHERE p.client_id = ANY(p_client_ids)
      AND p.cancelled = false
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
      AND (p.group_id IS NULL OR p.group_id NOT IN (SELECT bg.group_id FROM broker_groups bg))
  ),
  policy_payments_agg AS (
    SELECT pp.policy_id, SUM(pp.amount) AS total_paid
    FROM policy_payments pp
    JOIN active_policies ap ON ap.id = pp.policy_id
    WHERE pp.refused IS NOT TRUE
    GROUP BY pp.policy_id
  ),
  group_totals AS (
    SELECT
      ap.group_id,
      COALESCE(SUM(CASE WHEN ap.policy_type_parent <> 'ELZAMI' THEN ap.price ELSE 0 END), 0) AS non_elzami_price,
      -- المتبقي الصحيح = min(non_elzami, full - paid)
      GREATEST(0, LEAST(
        COALESCE(SUM(CASE WHEN ap.policy_type_parent <> 'ELZAMI' THEN ap.price ELSE 0 END), 0),
        SUM(ap.price) - COALESCE(SUM(ppa.total_paid), 0)
      )) AS group_remaining
    FROM active_policies ap
    LEFT JOIN policy_payments_agg ppa ON ppa.policy_id = ap.id
    WHERE ap.group_id IS NOT NULL
    GROUP BY ap.group_id
  )
  -- Packages: distribute remaining proportionally among non-ELZAMI policies
  SELECT
    ap.client_id,
    ap.id AS policy_id,
    ap.policy_number,
    ap.price AS insurance_price,
    CASE
      WHEN gt.non_elzami_price > 0 AND ap.policy_type_parent <> 'ELZAMI' THEN
        ROUND((ap.price / gt.non_elzami_price) * (gt.non_elzami_price - gt.group_remaining), 2)
      WHEN ap.policy_type_parent = 'ELZAMI' THEN ap.price
      ELSE 0
    END AS paid,
    CASE
      WHEN gt.non_elzami_price > 0 AND ap.policy_type_parent <> 'ELZAMI' THEN
        ROUND((ap.price / gt.non_elzami_price) * gt.group_remaining, 2)
      ELSE 0
    END AS remaining,
    ap.end_date,
    (ap.end_date - CURRENT_DATE)::integer AS days_until_expiry,
    CASE
      WHEN ap.cancelled = true THEN 'cancelled'
      WHEN ap.end_date < CURRENT_DATE THEN 'expired'
      ELSE 'active'
    END AS status,
    ap.policy_type_parent::text,
    ap.policy_type_child::text,
    car.car_number,
    ap.group_id
  FROM active_policies ap
  INNER JOIN group_totals gt ON gt.group_id = ap.group_id
  LEFT JOIN cars car ON car.id = ap.car_id
  WHERE gt.group_remaining > 0

  UNION ALL

  -- Single policies (no group)
  SELECT
    ap.client_id,
    ap.id AS policy_id,
    ap.policy_number,
    ap.price AS insurance_price,
    COALESCE(ppa.total_paid, 0) AS paid,
    GREATEST(0, ap.price - COALESCE(ppa.total_paid, 0)) AS remaining,
    ap.end_date,
    (ap.end_date - CURRENT_DATE)::integer AS days_until_expiry,
    CASE
      WHEN ap.cancelled = true THEN 'cancelled'
      WHEN ap.end_date < CURRENT_DATE THEN 'expired'
      ELSE 'active'
    END AS status,
    ap.policy_type_parent::text,
    ap.policy_type_child::text,
    car.car_number,
    ap.group_id
  FROM active_policies ap
  LEFT JOIN policy_payments_agg ppa ON ppa.policy_id = ap.id
  LEFT JOIN cars car ON car.id = ap.car_id
  WHERE ap.group_id IS NULL
    AND ap.policy_type_parent <> 'ELZAMI'
    AND ap.price - COALESCE(ppa.total_paid, 0) > 0
  ORDER BY remaining DESC;
END;
$function$;
