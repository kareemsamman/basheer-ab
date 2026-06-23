-- ============================================================================
-- Automatic, type-agnostic renewal detection (rolling window around expiry)
-- ============================================================================
-- Goal: the system should AUTOMATICALLY know a client renewed, without an
-- employee having to manually mark it.
--
-- A newer policy counts as a RENEWAL of an expiring policy `p` when ALL hold:
--   * same client                         (newer.client_id = p.client_id)
--   * a different, active policy           (id <> p.id, not cancelled / transferred /
--                                           deleted, still in force: end_date > today)
--   * ANY type / car / company             (no type or car matching — a renewal can be
--                                           of any kind, per the product owner)
--   * starts within the RENEWAL WINDOW of the old policy's expiry:
--         p.end_date - 2 months  <=  newer.start_date  <=  p.end_date + 6 months
--
-- Why a rolling window (and not "any later policy", which was the old behaviour,
-- nor a same-calendar-year test):
--   * lower bound (expiry - 2 months): a ROAD_SERVICE / add-on bought early in the
--     SAME term (~10-12 months before expiry) is NOT mistaken for a renewal, so the
--     main policy is never wrongly hidden from the renewals list. It still allows a
--     slightly-early renewal.
--   * upper bound (expiry + 6 months): captures the product owner's "renews any time
--     from expiry up to ~end of the year" intent CONSISTENTLY for every expiry month,
--     including December expiries that renew in January (a calendar-year test fails
--     here). A renewal done long after expiry (gap > 6 months) intentionally stays
--     "not renewed" and an employee can mark it manually (rare, by design).
--
-- The window (2 months back / 6 months forward) is tunable here if needed.
--
-- Functions updated (all use the identical rule):
--   1. report_renewals (paginated)          -> "بانتظار التجديد" list + sidebar badge
--   2. get_client_renewal_policies (2-arg)  -> (also fixes a latent prt.status bug)
--   3. get_client_renewal_policies (3-arg)  -> renewal wizard prefill / expand row
--   4. report_renewed_clients               -> "تم التجديد" list
--   5. report_renewals_service_detailed     -> renewals PDF report
-- ============================================================================

-- 1. report_renewals (paginated) — pending list + badge count
CREATE OR REPLACE FUNCTION public.report_renewals(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_policy_type text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_page_size integer DEFAULT 50, p_page integer DEFAULT 1)
 RETURNS TABLE(client_id uuid, client_name text, client_file_number text, client_phone text, policies_count integer, earliest_end_date date, days_remaining integer, total_insurance_price numeric, policy_types text[], policy_ids uuid[], car_numbers text[], worst_renewal_status text, renewal_notes text, total_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE v_offset integer;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  RETURN QUERY
  WITH client_policies AS (
    SELECT c.id as cid, c.full_name as cname, c.file_number as cfile, c.phone_number as cphone,
      p.id as pid, p.end_date, p.insurance_price, p.policy_type_parent, p.policy_type_child,
      COALESCE(prt.renewal_status, 'not_contacted') as rstatus, prt.notes as rnotes, car.car_number as car_num
    FROM policies p
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN cars car ON car.id = p.car_id
    LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
    WHERE p.cancelled = false AND p.transferred = false AND p.deleted_at IS NULL AND c.deleted_at IS NULL
      AND p.end_date >= COALESCE(p_start_date, p.end_date) AND p.end_date <= COALESCE(p_end_date, p.end_date)
      AND (NULLIF(p_policy_type, '') IS NULL OR p.policy_type_parent::text = NULLIF(p_policy_type, ''))
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      AND (p_search IS NULL OR c.full_name ILIKE '%' || p_search || '%' OR c.phone_number ILIKE '%' || p_search || '%'
        OR c.file_number ILIKE '%' || p_search || '%' OR c.id_number ILIKE '%' || p_search || '%' OR car.car_number ILIKE '%' || p_search || '%')
      -- exclude policies already renewed (client has a newer policy within the renewal window)
      AND NOT EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id
          AND newer.id <> p.id
          AND newer.deleted_at IS NULL AND newer.cancelled = false AND newer.transferred = false
          AND newer.end_date > CURRENT_DATE
          AND newer.start_date >= (p.end_date - INTERVAL '2 months')::date
          AND newer.start_date <= (p.end_date + INTERVAL '6 months')::date
      )
  ),
  aggregated AS (
    SELECT cp.cid, cp.cname, cp.cfile, cp.cphone, COUNT(*)::integer as pcount, MIN(cp.end_date) as min_end,
      (MIN(cp.end_date) - CURRENT_DATE)::integer as days_rem, SUM(COALESCE(cp.insurance_price, 0)) as total_price,
      ARRAY_AGG(DISTINCT
        CASE
          WHEN cp.policy_type_parent::text = 'THIRD_FULL' AND cp.policy_type_child IS NOT NULL
          THEN cp.policy_type_child::text
          ELSE cp.policy_type_parent::text
        END
      ) FILTER (WHERE cp.policy_type_parent IS NOT NULL) as ptypes,
      ARRAY_AGG(cp.pid) as pids,
      ARRAY_AGG(DISTINCT cp.car_num) FILTER (WHERE cp.car_num IS NOT NULL) as car_nums,
      CASE WHEN bool_or(cp.rstatus = 'not_contacted') THEN 'not_contacted'
        WHEN bool_or(cp.rstatus = 'sms_sent') THEN 'sms_sent'
        WHEN bool_or(cp.rstatus = 'called') THEN 'called'
        WHEN bool_or(cp.rstatus = 'not_interested') THEN 'not_interested'
        ELSE 'renewed' END as worst_status,
      STRING_AGG(cp.rnotes, '; ') FILTER (WHERE cp.rnotes IS NOT NULL) as notes_agg
    FROM client_policies cp GROUP BY cp.cid, cp.cname, cp.cfile, cp.cphone
  ),
  counted AS (SELECT COUNT(*) OVER() as total FROM aggregated)
  SELECT a.cid, a.cname, a.cfile, a.cphone, a.pcount, a.min_end, a.days_rem, a.total_price,
    a.ptypes, a.pids, a.car_nums, a.worst_status, a.notes_agg, (SELECT total FROM counted LIMIT 1)
  FROM aggregated a ORDER BY a.min_end ASC LIMIT p_page_size OFFSET v_offset;
END;
$function$;

-- 2. get_client_renewal_policies (2-arg) — fixes latent prt.status -> prt.renewal_status
CREATE OR REPLACE FUNCTION public.get_client_renewal_policies(p_client_id uuid, p_end_month date)
 RETURNS TABLE(policy_id uuid, car_number text, policy_type_parent text, company_name_ar text, end_date date, days_remaining integer, insurance_price numeric, renewal_status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id AS policy_id, car.car_number, p.policy_type_parent::text, ic.name_ar AS company_name_ar, p.end_date,
    (p.end_date::date - CURRENT_DATE)::INTEGER AS days_remaining, COALESCE(p.insurance_price, 0) AS insurance_price,
    COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
  FROM policies p
  LEFT JOIN cars car ON car.id = p.car_id
  LEFT JOIN insurance_companies ic ON ic.id = p.company_id
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
  WHERE p.client_id = p_client_id AND p.cancelled = false AND p.transferred = false
    AND p.end_date IS NOT NULL AND p.end_date >= CURRENT_DATE
    AND p.end_date < (p_end_month + INTERVAL '1 month')::DATE
    AND p.policy_type_parent::text NOT IN ('ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION')
    AND NOT EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.id <> p.id
        AND newer.cancelled = false AND newer.transferred = false
        AND newer.end_date > CURRENT_DATE
        AND newer.start_date >= (p.end_date - INTERVAL '2 months')::date
        AND newer.start_date <= (p.end_date + INTERVAL '6 months')::date
    )
  ORDER BY p.end_date ASC;
END;
$function$;

-- 3. get_client_renewal_policies (3-arg) — used by the renewal wizard prefill / expand row
CREATE OR REPLACE FUNCTION public.get_client_renewal_policies(p_client_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, car_id uuid, car_number text, policy_type_parent text, policy_type_child text, company_id uuid, company_name text, company_name_ar text, start_date date, end_date date, days_remaining integer, insurance_price numeric, renewal_status text, renewal_notes text, reminder_sent_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id, p.car_id, car.car_number, p.policy_type_parent::text, p.policy_type_child::text,
    p.company_id, ic.name as company_name, ic.name_ar as company_name_ar, p.start_date, p.end_date,
    (p.end_date - CURRENT_DATE)::integer as days_remaining, p.insurance_price,
    COALESCE(prt.renewal_status, 'not_contacted') as renewal_status, prt.notes as renewal_notes, prt.reminder_sent_at
  FROM public.policies p
  LEFT JOIN public.cars car ON car.id = p.car_id
  LEFT JOIN public.insurance_companies ic ON ic.id = p.company_id
  LEFT JOIN public.policy_renewal_tracking prt ON prt.policy_id = p.id
  WHERE p.client_id = p_client_id AND p.deleted_at IS NULL AND p.cancelled IS NOT TRUE AND p.transferred IS NOT TRUE
    AND (p_start_date IS NULL OR p.end_date >= p_start_date) AND (p_end_date IS NULL OR p.end_date <= p_end_date)
    AND NOT EXISTS (
      SELECT 1 FROM public.policies newer
      WHERE newer.client_id = p.client_id
        AND newer.id <> p.id
        AND newer.deleted_at IS NULL AND newer.cancelled IS NOT TRUE AND newer.transferred IS NOT TRUE
        AND newer.end_date > CURRENT_DATE
        AND newer.start_date >= (p.end_date - INTERVAL '2 months')::date
        AND newer.start_date <= (p.end_date + INTERVAL '6 months')::date
    )
  ORDER BY p.end_date ASC;
END;
$function$;

-- 4. report_renewed_clients — "تم التجديد" list (mirror of the pending rule)
CREATE OR REPLACE FUNCTION public.report_renewed_clients(p_end_month text DEFAULT NULL::text, p_policy_type text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(client_id uuid, client_name text, client_file_number text, client_phone text, policies_count bigint, earliest_end_date date, total_insurance_price numeric, policy_types text[], policy_ids uuid[], new_policies_count bigint, new_policy_ids uuid[], new_policy_types text[], new_total_price numeric, new_start_date date, has_package boolean, renewed_by_admin_id uuid, renewed_by_name text, total_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE v_month_start date; v_month_end date; v_policy_type public.policy_type_parent;
BEGIN
  IF p_end_month IS NOT NULL AND p_end_month != '' THEN
    v_month_start := date_trunc('month', p_end_month::date);
    v_month_end := (date_trunc('month', p_end_month::date) + interval '1 month' - interval '1 day')::date;
  ELSE
    v_month_start := date_trunc('month', CURRENT_DATE);
    v_month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  END IF;
  v_policy_type := NULLIF(p_policy_type, '')::public.policy_type_parent;
  RETURN QUERY
  WITH expiring_policies AS (
    SELECT p.id, p.client_id, p.car_id, p.policy_type_parent AS ptype, p.group_id, p.insurance_price, p.end_date, p.start_date
    FROM policies p
    WHERE p.end_date BETWEEN v_month_start AND v_month_end AND p.cancelled = false AND p.transferred = false AND p.deleted_at IS NULL
      AND (v_policy_type IS NULL OR p.policy_type_parent = v_policy_type)
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      AND (p_search IS NULL OR p_search = '' OR EXISTS (
        SELECT 1 FROM clients c WHERE c.id = p.client_id AND (
          c.full_name ILIKE '%' || p_search || '%' OR c.id_number ILIKE '%' || p_search || '%'
          OR c.phone_number ILIKE '%' || p_search || '%' OR c.file_number ILIKE '%' || p_search || '%'
        )
      ))
      -- include only policies that HAVE been renewed (newer policy within the renewal window)
      AND EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id
          AND newer.id <> p.id
          AND newer.deleted_at IS NULL AND newer.cancelled = false AND newer.transferred = false
          AND newer.end_date > CURRENT_DATE
          AND newer.start_date >= (p.end_date - INTERVAL '2 months')::date
          AND newer.start_date <= (p.end_date + INTERVAL '6 months')::date
      )
  ),
  renewal_mappings AS (
    SELECT DISTINCT ON (ep.id) ep.id AS old_policy_id, ep.client_id, np.id AS new_policy_id,
      np.policy_type_parent AS new_ptype, np.insurance_price AS new_price, np.start_date AS new_start,
      np.group_id AS new_group_id, np.created_by_admin_id AS renewed_by
    FROM expiring_policies ep
    JOIN policies np ON np.client_id = ep.client_id
      AND np.id <> ep.id
      AND np.deleted_at IS NULL AND np.cancelled = false AND np.transferred = false
      AND np.end_date > CURRENT_DATE
      AND np.start_date >= (ep.end_date - INTERVAL '2 months')::date
      AND np.start_date <= (ep.end_date + INTERVAL '6 months')::date
    ORDER BY ep.id, np.start_date ASC
  ),
  client_aggregates AS (
    SELECT ep.client_id, c.full_name AS client_name, c.file_number AS client_file_number, c.phone_number AS client_phone,
      COUNT(DISTINCT ep.id) AS policies_count, MIN(ep.end_date) AS earliest_end_date,
      COALESCE(SUM(ep.insurance_price), 0) AS total_insurance_price,
      ARRAY_AGG(DISTINCT ep.ptype::text) AS policy_types, ARRAY_AGG(DISTINCT ep.id) AS policy_ids,
      COUNT(DISTINCT rm.new_policy_id) AS new_policies_count,
      ARRAY_AGG(DISTINCT rm.new_policy_id) FILTER (WHERE rm.new_policy_id IS NOT NULL) AS new_policy_ids,
      ARRAY_AGG(DISTINCT rm.new_ptype::text) FILTER (WHERE rm.new_ptype IS NOT NULL) AS new_policy_types,
      COALESCE(SUM(DISTINCT rm.new_price) FILTER (WHERE rm.new_policy_id IS NOT NULL), 0) AS new_total_price,
      MIN(rm.new_start) AS new_start_date,
      bool_or(ep.group_id IS NOT NULL OR rm.new_group_id IS NOT NULL) AS has_package,
      (ARRAY_AGG(rm.renewed_by ORDER BY rm.new_start ASC) FILTER (WHERE rm.renewed_by IS NOT NULL))[1] AS renewed_by_admin_id
    FROM expiring_policies ep JOIN clients c ON c.id = ep.client_id
    LEFT JOIN renewal_mappings rm ON rm.old_policy_id = ep.id
    GROUP BY ep.client_id, c.full_name, c.file_number, c.phone_number
  )
  SELECT ca.client_id, ca.client_name, ca.client_file_number, ca.client_phone, ca.policies_count,
    ca.earliest_end_date, ca.total_insurance_price, ca.policy_types, ca.policy_ids, ca.new_policies_count,
    ca.new_policy_ids, ca.new_policy_types, ca.new_total_price, ca.new_start_date, ca.has_package,
    ca.renewed_by_admin_id, pr.full_name AS renewed_by_name, COUNT(*) OVER()::bigint AS total_count
  FROM client_aggregates ca LEFT JOIN profiles pr ON pr.id = ca.renewed_by_admin_id
  ORDER BY ca.earliest_end_date ASC, ca.client_name LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- 5. report_renewals_service_detailed — renewals PDF report
CREATE OR REPLACE FUNCTION public.report_renewals_service_detailed(
  p_end_month DATE,
  p_days_remaining INTEGER DEFAULT NULL,
  p_policy_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  policy_id UUID,
  client_id UUID,
  client_name TEXT,
  client_file_number TEXT,
  client_phone TEXT,
  car_number TEXT,
  policy_type_parent TEXT,
  company_name_ar TEXT,
  end_date DATE,
  days_remaining INTEGER,
  insurance_price NUMERIC,
  renewal_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id AS policy_id, c.id AS client_id, c.full_name AS client_name, c.file_number AS client_file_number,
    c.phone_number AS client_phone, car.car_number, p.policy_type_parent::text, ic.name_ar AS company_name_ar,
    p.end_date, (p.end_date::date - CURRENT_DATE)::INTEGER AS days_remaining,
    COALESCE(p.insurance_price, 0) AS insurance_price, COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
  FROM policies p
  INNER JOIN clients c ON c.id = p.client_id
  LEFT JOIN cars car ON car.id = p.car_id
  LEFT JOIN insurance_companies ic ON ic.id = p.company_id
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
  WHERE p.cancelled = false AND p.transferred = false AND p.end_date IS NOT NULL
    AND p.end_date >= CURRENT_DATE AND p.end_date < (p_end_month + INTERVAL '1 month')::DATE
    AND p.policy_type_parent::text NOT IN ('ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION')
    AND NOT EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.id <> p.id
        AND newer.deleted_at IS NULL AND newer.cancelled = false AND newer.transferred = false
        AND newer.end_date > CURRENT_DATE
        AND newer.start_date >= (p.end_date - INTERVAL '2 months')::date
        AND newer.start_date <= (p.end_date + INTERVAL '6 months')::date
    )
    AND (p_days_remaining IS NULL OR (p.end_date::date - CURRENT_DATE) <= p_days_remaining)
    AND (p_policy_type IS NULL OR p.policy_type_parent::text = p_policy_type)
  ORDER BY p.end_date ASC, c.full_name ASC;
END;
$$;

-- 6. Shared helper: of the given policy ids, which ones are already renewed?
--    (same rolling-window rule; used by the reminder SMS jobs so they never message renewed clients)
CREATE OR REPLACE FUNCTION public.get_renewed_policy_ids(p_policy_ids uuid[])
 RETURNS TABLE(policy_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id
  FROM policies p
  WHERE p.id = ANY(p_policy_ids)
    AND EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.id <> p.id
        AND newer.deleted_at IS NULL AND newer.cancelled = false AND newer.transferred = false
        AND newer.end_date > CURRENT_DATE
        AND newer.start_date >= (p.end_date - INTERVAL '2 months')::date
        AND newer.start_date <= (p.end_date + INTERVAL '6 months')::date
    );
$function$;

-- 7. Dashboard "expiring soon" widget source — same rolling-window rule, so renewed
--    clients drop off the widget automatically (no manual policy_renewal_tracking flag).
CREATE OR REPLACE FUNCTION public.get_dashboard_expiring_policies(p_days integer DEFAULT 30, p_limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, end_date date, policy_type_parent text, policy_type_child text, insurance_price numeric, client_full_name text, car_number text, company_name text, company_name_ar text, renewal_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.end_date, p.policy_type_parent::text, p.policy_type_child::text,
    COALESCE(p.insurance_price, 0) AS insurance_price,
    c.full_name AS client_full_name, car.car_number,
    ic.name AS company_name, ic.name_ar AS company_name_ar,
    COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
  FROM policies p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN cars car ON car.id = p.car_id
  LEFT JOIN insurance_companies ic ON ic.id = p.company_id
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
  WHERE p.deleted_at IS NULL AND p.cancelled = false AND p.transferred = false AND c.deleted_at IS NULL
    AND p.end_date >= CURRENT_DATE
    AND p.end_date <= (CURRENT_DATE + p_days)
    AND NOT EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.id <> p.id
        AND newer.deleted_at IS NULL AND newer.cancelled = false AND newer.transferred = false
        AND newer.end_date > CURRENT_DATE
        AND newer.start_date >= (p.end_date - INTERVAL '2 months')::date
        AND newer.start_date <= (p.end_date + INTERVAL '6 months')::date
    )
  ORDER BY p.end_date ASC
  LIMIT p_limit;
$function$;

GRANT EXECUTE ON FUNCTION public.get_renewed_policy_ids(uuid[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_expiring_policies(integer, integer) TO authenticated, anon, service_role;

-- 8. Remove the old car+type "auto-mark renewed" trigger. Renewed-ness is now computed
--    live in the functions above, so this persisted flag is redundant and divergent
--    (it only matched same car + same type, and had no near-expiry window).
DROP TRIGGER IF EXISTS trg_auto_mark_renewed ON policies;
DROP FUNCTION IF EXISTS public.auto_mark_renewed_policies();

-- Clear stale persisted 'renewed' flags so they can no longer show a wrong badge on a
-- policy that the live rule considers still pending. Detection is computed live now.
UPDATE policy_renewal_tracking SET renewal_status = 'not_contacted', updated_at = now()
WHERE renewal_status = 'renewed';
