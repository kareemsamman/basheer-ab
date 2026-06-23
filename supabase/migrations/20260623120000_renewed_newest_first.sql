-- ============================================================================
-- "تم التجديد" list: always show the NEWEST renewals first
-- ============================================================================
-- The renewed list was ordered by earliest_end_date ASC (oldest first). The
-- product owner wants the newest at the top. We only change the final ORDER BY
-- (earliest_end_date DESC, then most-recent new policy). Everything else is
-- identical to the definition in 20260623100000.
--
-- (The pending "بانتظار التجديد" list already sorts most-overdue first via
--  report_renewals' ORDER BY min_end ASC — unchanged.)
-- ============================================================================

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
      -- include only policies that HAVE been renewed (manual mark OR newer policy within the window)
      AND public.is_renewed(p.id)
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
      COALESCE(ARRAY_AGG(DISTINCT ep.ptype::text), '{}') AS policy_types, ARRAY_AGG(DISTINCT ep.id) AS policy_ids,
      COUNT(DISTINCT rm.new_policy_id) AS new_policies_count,
      COALESCE(ARRAY_AGG(DISTINCT rm.new_policy_id) FILTER (WHERE rm.new_policy_id IS NOT NULL), '{}') AS new_policy_ids,
      COALESCE(ARRAY_AGG(DISTINCT rm.new_ptype::text) FILTER (WHERE rm.new_ptype IS NOT NULL), '{}') AS new_policy_types,
      COALESCE(SUM(DISTINCT rm.new_price) FILTER (WHERE rm.new_policy_id IS NOT NULL), 0) AS new_total_price,
      MIN(rm.new_start) AS new_start_date,
      COALESCE(bool_or(ep.group_id IS NOT NULL OR rm.new_group_id IS NOT NULL), false) AS has_package,
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
  -- newest first
  ORDER BY ca.earliest_end_date DESC, ca.new_start_date DESC NULLS LAST, ca.client_name LIMIT p_limit OFFSET p_offset;
END;
$function$;
