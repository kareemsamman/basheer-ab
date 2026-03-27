-- Update report_renewals to exclude 'renewed' and 'declined_renewal' from pending list
CREATE OR REPLACE FUNCTION report_renewals(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_policy_type text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page_size integer DEFAULT 25,
  p_page integer DEFAULT 1
)
RETURNS TABLE(
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  policies_count integer,
  earliest_end_date date,
  days_remaining integer,
  total_insurance_price numeric,
  policy_types text[],
  policy_ids uuid[],
  car_numbers text[],
  worst_renewal_status text,
  renewal_notes text,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_offset integer;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  RETURN QUERY
  WITH client_policies AS (
    SELECT c.id as cid, c.full_name as cname, c.file_number as cfile, c.phone_number as cphone,
      p.id as pid, p.end_date, p.insurance_price, p.policy_type_parent,
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
      AND NOT EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id AND newer.deleted_at IS NULL AND newer.cancelled = false
          AND newer.transferred = false AND newer.start_date > p.start_date AND newer.end_date > CURRENT_DATE
      )
      AND COALESCE(prt.renewal_status, 'not_contacted') NOT IN ('renewed', 'declined_renewal')
  ),
  aggregated AS (
    SELECT cp.cid, cp.cname, cp.cfile, cp.cphone, COUNT(*)::integer as pcount, MIN(cp.end_date) as min_end,
      (MIN(cp.end_date) - CURRENT_DATE)::integer as days_rem, SUM(COALESCE(cp.insurance_price, 0)) as total_price,
      ARRAY_AGG(DISTINCT cp.policy_type_parent::text) FILTER (WHERE cp.policy_type_parent IS NOT NULL) as ptypes,
      ARRAY_AGG(cp.pid) as pids,
      ARRAY_AGG(DISTINCT cp.car_num) FILTER (WHERE cp.car_num IS NOT NULL) as car_nums,
      CASE WHEN bool_or(cp.rstatus = 'not_contacted') THEN 'not_contacted'
        WHEN bool_or(cp.rstatus = 'sms_sent') THEN 'sms_sent'
        WHEN bool_or(cp.rstatus = 'called') THEN 'called'
        WHEN bool_or(cp.rstatus = 'not_interested') THEN 'not_interested'
        ELSE 'not_contacted' END as worst_status,
      STRING_AGG(cp.rnotes, '; ') FILTER (WHERE cp.rnotes IS NOT NULL) as notes_agg
    FROM client_policies cp GROUP BY cp.cid, cp.cname, cp.cfile, cp.cphone
  ),
  counted AS (SELECT COUNT(*) OVER() as total FROM aggregated)
  SELECT a.cid, a.cname, a.cfile, a.cphone, a.pcount, a.min_end, a.days_rem, a.total_price,
    a.ptypes, a.pids, a.car_nums, a.worst_status, a.notes_agg, (SELECT total FROM counted LIMIT 1)
  FROM aggregated a ORDER BY a.min_end ASC LIMIT p_page_size OFFSET v_offset;
END;
$$;

-- Update report_renewals_summary to exclude renewed/declined from pending counts  
CREATE OR REPLACE FUNCTION report_renewals_summary(
  p_end_month date DEFAULT NULL,
  p_policy_type text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  total_expiring bigint,
  not_contacted bigint,
  sms_sent bigint,
  called bigint,
  renewed bigint,
  not_interested bigint,
  total_packages bigint,
  total_single bigint,
  total_value numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE month_start date; month_end date;
BEGIN
  IF p_end_month IS NULL THEN
    month_start := date_trunc('month', CURRENT_DATE)::date;
    month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  ELSE
    month_start := date_trunc('month', p_end_month::date)::date;
    month_end := (date_trunc('month', p_end_month::date) + interval '1 month' - interval '1 day')::date;
  END IF;
  RETURN QUERY
  WITH expiring_policies AS (
    SELECT p.id, p.client_id, p.group_id, p.insurance_price, p.policy_type_parent,
      EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id AND newer.cancelled = false AND newer.transferred = false
          AND newer.deleted_at IS NULL AND newer.start_date > p.start_date AND newer.end_date > CURRENT_DATE
      ) AS is_auto_renewed,
      COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
    FROM policies p
    LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
    WHERE p.end_date BETWEEN month_start AND month_end AND p.cancelled = false AND p.transferred = false AND p.deleted_at IS NULL
      AND (p_policy_type IS NULL OR p.policy_type_parent::text = p_policy_type)
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      AND (p_search IS NULL OR p_search = '' OR EXISTS (
        SELECT 1 FROM clients c WHERE c.id = p.client_id AND (
          c.full_name ILIKE '%' || p_search || '%' OR c.id_number ILIKE '%' || p_search || '%' OR c.phone_number ILIKE '%' || p_search || '%'
        )
      ))
  ),
  policies_with_status AS (
    SELECT ep.id, ep.client_id, ep.group_id, ep.insurance_price,
      CASE WHEN ep.is_auto_renewed THEN 'renewed' ELSE ep.renewal_status END AS final_status,
      ep.group_id IS NOT NULL AS has_package
    FROM expiring_policies ep
  ),
  client_statuses AS (
    SELECT pws.client_id,
      CASE WHEN bool_or(pws.final_status = 'not_contacted') THEN 'not_contacted'
        WHEN bool_or(pws.final_status = 'sms_sent') THEN 'sms_sent'
        WHEN bool_or(pws.final_status = 'called') THEN 'called'
        WHEN bool_or(pws.final_status = 'renewed') THEN 'renewed'
        WHEN bool_or(pws.final_status = 'not_interested') THEN 'not_interested'
        WHEN bool_or(pws.final_status = 'declined_renewal') THEN 'declined_renewal'
        ELSE 'not_contacted' END AS status,
      bool_or(pws.has_package) AS has_package, SUM(pws.insurance_price) AS total_value
    FROM policies_with_status pws GROUP BY pws.client_id
  )
  SELECT 
    COUNT(*) FILTER (WHERE cs.status NOT IN ('renewed', 'declined_renewal'))::bigint,
    COUNT(*) FILTER (WHERE cs.status = 'not_contacted')::bigint,
    COUNT(*) FILTER (WHERE cs.status = 'sms_sent')::bigint,
    COUNT(*) FILTER (WHERE cs.status = 'called')::bigint,
    COUNT(*) FILTER (WHERE cs.status = 'renewed')::bigint,
    COUNT(*) FILTER (WHERE cs.status = 'not_interested')::bigint,
    COUNT(*) FILTER (WHERE cs.has_package AND cs.status NOT IN ('renewed', 'declined_renewal'))::bigint,
    COUNT(*) FILTER (WHERE NOT cs.has_package AND cs.status NOT IN ('renewed', 'declined_renewal'))::bigint,
    COALESCE(SUM(cs.total_value) FILTER (WHERE cs.status NOT IN ('renewed', 'declined_renewal')), 0)::numeric
  FROM client_statuses cs;
END;
$$;

-- Create report_declined_renewals RPC
CREATE OR REPLACE FUNCTION report_declined_renewals(
  p_end_month date DEFAULT NULL,
  p_policy_type text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page_size integer DEFAULT 25,
  p_page integer DEFAULT 1
)
RETURNS TABLE(
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  policies_count integer,
  earliest_end_date date,
  total_insurance_price numeric,
  policy_types text[],
  decline_reason text,
  declined_by_name text,
  declined_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_offset integer; month_start date; month_end date;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  IF p_end_month IS NULL THEN
    month_start := date_trunc('month', CURRENT_DATE)::date;
    month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  ELSE
    month_start := date_trunc('month', p_end_month::date)::date;
    month_end := (date_trunc('month', p_end_month::date) + interval '1 month' - interval '1 day')::date;
  END IF;

  RETURN QUERY
  WITH declined_policies AS (
    SELECT c.id as cid, c.full_name as cname, c.file_number as cfile, c.phone_number as cphone,
      p.id as pid, p.end_date, p.insurance_price, p.policy_type_parent,
      prt.notes as rnotes, prt.contacted_by, prt.updated_at as declined_date
    FROM policies p
    JOIN clients c ON c.id = p.client_id
    JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
    WHERE p.cancelled = false AND p.transferred = false AND p.deleted_at IS NULL AND c.deleted_at IS NULL
      AND p.end_date BETWEEN month_start AND month_end
      AND prt.renewal_status = 'declined_renewal'
      AND (NULLIF(p_policy_type, '') IS NULL OR p.policy_type_parent::text = NULLIF(p_policy_type, ''))
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      AND (p_search IS NULL OR c.full_name ILIKE '%' || p_search || '%' OR c.phone_number ILIKE '%' || p_search || '%'
        OR c.file_number ILIKE '%' || p_search || '%')
  ),
  aggregated AS (
    SELECT dp.cid, dp.cname, dp.cfile, dp.cphone,
      COUNT(*)::integer as pcount, MIN(dp.end_date) as min_end,
      SUM(COALESCE(dp.insurance_price, 0)) as total_price,
      ARRAY_AGG(DISTINCT dp.policy_type_parent::text) FILTER (WHERE dp.policy_type_parent IS NOT NULL) as ptypes,
      STRING_AGG(DISTINCT dp.rnotes, '; ') FILTER (WHERE dp.rnotes IS NOT NULL) as reason,
      (SELECT pr.display_name FROM profiles pr WHERE pr.id = MAX(dp.contacted_by)) as by_name,
      MAX(dp.declined_date) as max_declined
    FROM declined_policies dp GROUP BY dp.cid, dp.cname, dp.cfile, dp.cphone
  ),
  counted AS (SELECT COUNT(*) OVER() as total FROM aggregated)
  SELECT a.cid, a.cname, a.cfile, a.cphone, a.pcount, a.min_end, a.total_price,
    a.ptypes, a.reason, a.by_name, a.max_declined, (SELECT total FROM counted LIMIT 1)
  FROM aggregated a ORDER BY a.max_declined DESC LIMIT p_page_size OFFSET v_offset;
END;
$$;