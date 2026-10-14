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
    -- ELZAMI is never agency debt: only the non-ELZAMI price is owed.
    -- Money paid on the ELZAMI line up to its price covers ELZAMI only; any excess counts toward the package.
    SELECT
      SUM(CASE WHEN ap.policy_type_parent <> 'ELZAMI' THEN ap.price ELSE 0 END)
      - (
          COALESCE(SUM(pay.amt), 0)
          - LEAST(
              COALESCE(SUM(CASE WHEN ap.policy_type_parent = 'ELZAMI' THEN pay.amt ELSE 0 END), 0),
              SUM(CASE WHEN ap.policy_type_parent = 'ELZAMI' THEN ap.price ELSE 0 END)
            )
        ) AS net
    FROM active_policies ap
    LEFT JOIN pay ON pay.policy_id = ap.id
    GROUP BY ap.package_id
  )
  SELECT COALESCE(SUM(GREATEST(0, net)), 0) FROM packages;
$function$;

CREATE OR REPLACE FUNCTION public.report_debt_policies_for_clients(p_client_ids uuid[])
 RETURNS TABLE(client_id uuid, policy_id uuid, policy_number text, insurance_price numeric, paid numeric, remaining numeric, end_date date, days_until_expiry integer, status text, policy_type_parent text, policy_type_child text, car_number text, group_id uuid)
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
      GREATEST(0,
        COALESCE(SUM(CASE WHEN ap.policy_type_parent <> 'ELZAMI' THEN ap.price ELSE 0 END), 0)
        - (
            COALESCE(SUM(ppa.total_paid), 0)
            - LEAST(
                COALESCE(SUM(CASE WHEN ap.policy_type_parent = 'ELZAMI' THEN ppa.total_paid ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN ap.policy_type_parent = 'ELZAMI' THEN ap.price ELSE 0 END), 0)
              )
          )
      ) AS group_remaining
    FROM active_policies ap
    LEFT JOIN policy_payments_agg ppa ON ppa.policy_id = ap.id
    WHERE ap.group_id IS NOT NULL
    GROUP BY ap.group_id
  )
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