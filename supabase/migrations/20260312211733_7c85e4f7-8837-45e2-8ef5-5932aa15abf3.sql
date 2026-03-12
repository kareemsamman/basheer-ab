
-- Drop the paginated overload first (return type mismatch)
DROP FUNCTION IF EXISTS public.report_renewals(date, date, text, uuid, text, integer, integer);

-- Recreate paginated overload with correct return columns
CREATE OR REPLACE FUNCTION public.report_renewals(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_policy_type text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page_size integer DEFAULT 50,
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
AS $$
DECLARE
  v_offset integer;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  RETURN QUERY
  WITH client_policies AS (
    SELECT
      c.id as cid,
      c.full_name as cname,
      c.file_number as cfile,
      c.phone_number as cphone,
      p.id as pid,
      p.end_date,
      p.insurance_price,
      p.policy_type_parent,
      COALESCE(prt.renewal_status, 'not_contacted') as rstatus,
      prt.notes as rnotes,
      car.car_number as car_num
    FROM policies p
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN cars car ON car.id = p.car_id
    LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
    WHERE p.cancelled = false
      AND p.transferred = false
      AND p.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND p.end_date >= COALESCE(p_start_date, p.end_date)
      AND p.end_date <= COALESCE(p_end_date, p.end_date)
      AND (
        NULLIF(p_policy_type, '') IS NULL
        OR p.policy_type_parent::text = NULLIF(p_policy_type, '')
      )
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      AND (
        p_search IS NULL
        OR c.full_name ILIKE '%' || p_search || '%'
        OR c.phone_number ILIKE '%' || p_search || '%'
        OR c.file_number ILIKE '%' || p_search || '%'
        OR c.id_number ILIKE '%' || p_search || '%'
        OR car.car_number ILIKE '%' || p_search || '%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id
          AND newer.car_id IS NOT DISTINCT FROM p.car_id
          AND newer.deleted_at IS NULL
          AND newer.cancelled = false
          AND newer.transferred = false
          AND newer.start_date > p.start_date
          AND newer.end_date > CURRENT_DATE
      )
  ),
  aggregated AS (
    SELECT
      cp.cid,
      cp.cname,
      cp.cfile,
      cp.cphone,
      COUNT(*)::integer as pcount,
      MIN(cp.end_date) as min_end,
      (MIN(cp.end_date) - CURRENT_DATE)::integer as days_rem,
      SUM(COALESCE(cp.insurance_price, 0)) as total_price,
      ARRAY_AGG(DISTINCT cp.policy_type_parent::text) 
        FILTER (WHERE cp.policy_type_parent IS NOT NULL) as ptypes,
      ARRAY_AGG(cp.pid) as pids,
      ARRAY_AGG(DISTINCT cp.car_num) 
        FILTER (WHERE cp.car_num IS NOT NULL) as car_nums,
      CASE
        WHEN bool_or(cp.rstatus = 'not_contacted') THEN 'not_contacted'
        WHEN bool_or(cp.rstatus = 'sms_sent') THEN 'sms_sent'
        WHEN bool_or(cp.rstatus = 'called') THEN 'called'
        WHEN bool_or(cp.rstatus = 'not_interested') THEN 'not_interested'
        ELSE 'renewed'
      END as worst_status,
      STRING_AGG(cp.rnotes, '; ') 
        FILTER (WHERE cp.rnotes IS NOT NULL) as notes_agg
    FROM client_policies cp
    GROUP BY cp.cid, cp.cname, cp.cfile, cp.cphone
  ),
  counted AS (
    SELECT COUNT(*) OVER() as total FROM aggregated
  )
  SELECT
    a.cid,
    a.cname,
    a.cfile,
    a.cphone,
    a.pcount,
    a.min_end,
    a.days_rem,
    a.total_price,
    a.ptypes,
    a.pids,
    a.car_nums,
    a.worst_status,
    a.notes_agg,
    (SELECT total FROM counted LIMIT 1)
  FROM aggregated a
  ORDER BY a.min_end ASC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- Update report_renewals_summary (remove policy_type_parent matching)
CREATE OR REPLACE FUNCTION public.report_renewals_summary(
  p_end_month text DEFAULT NULL,
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
AS $$
DECLARE
  month_start date;
  month_end date;
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
    SELECT 
      p.id,
      p.client_id,
      p.group_id,
      p.insurance_price,
      p.policy_type_parent,
      EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id
          AND newer.car_id IS NOT DISTINCT FROM p.car_id
          AND newer.cancelled = false
          AND newer.transferred = false
          AND newer.deleted_at IS NULL
          AND newer.start_date > p.start_date
          AND newer.end_date > CURRENT_DATE
      ) AS is_auto_renewed,
      COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
    FROM policies p
    LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
    WHERE p.end_date BETWEEN month_start AND month_end
      AND p.cancelled = false
      AND p.transferred = false
      AND p.deleted_at IS NULL
      AND (p_policy_type IS NULL OR p.policy_type_parent::text = p_policy_type)
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      AND (
        p_search IS NULL 
        OR p_search = ''
        OR EXISTS (
          SELECT 1 FROM clients c 
          WHERE c.id = p.client_id 
          AND (
            c.full_name ILIKE '%' || p_search || '%'
            OR c.id_number ILIKE '%' || p_search || '%'
            OR c.phone_number ILIKE '%' || p_search || '%'
          )
        )
      )
  ),
  policies_with_status AS (
    SELECT
      ep.id,
      ep.client_id,
      ep.group_id,
      ep.insurance_price,
      CASE 
        WHEN ep.is_auto_renewed THEN 'renewed'
        ELSE ep.renewal_status
      END AS final_status,
      ep.group_id IS NOT NULL AS has_package
    FROM expiring_policies ep
  ),
  client_statuses AS (
    SELECT 
      pws.client_id,
      CASE 
        WHEN bool_or(pws.final_status = 'not_contacted') THEN 'not_contacted'
        WHEN bool_or(pws.final_status = 'sms_sent') THEN 'sms_sent'
        WHEN bool_or(pws.final_status = 'called') THEN 'called'
        WHEN bool_or(pws.final_status = 'renewed') THEN 'renewed'
        WHEN bool_or(pws.final_status = 'not_interested') THEN 'not_interested'
        ELSE 'not_contacted'
      END AS status,
      bool_or(pws.has_package) AS has_package,
      SUM(pws.insurance_price) AS total_value
    FROM policies_with_status pws
    GROUP BY pws.client_id
  )
  SELECT
    COUNT(*)::bigint AS total_expiring,
    COUNT(*) FILTER (WHERE cs.status = 'not_contacted')::bigint AS not_contacted,
    COUNT(*) FILTER (WHERE cs.status = 'sms_sent')::bigint AS sms_sent,
    COUNT(*) FILTER (WHERE cs.status = 'called')::bigint AS called,
    COUNT(*) FILTER (WHERE cs.status = 'renewed')::bigint AS renewed,
    COUNT(*) FILTER (WHERE cs.status = 'not_interested')::bigint AS not_interested,
    COUNT(*) FILTER (WHERE cs.has_package AND cs.status != 'renewed')::bigint AS total_packages,
    COUNT(*) FILTER (WHERE NOT cs.has_package AND cs.status != 'renewed')::bigint AS total_single,
    COALESCE(SUM(cs.total_value) FILTER (WHERE cs.status != 'renewed'), 0)::numeric AS total_value
  FROM client_statuses cs;
END;
$$;

-- Update report_renewed_clients (remove policy_type_parent matching)
CREATE OR REPLACE FUNCTION public.report_renewed_clients(
  p_end_month text DEFAULT NULL,
  p_policy_type text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  policies_count bigint,
  earliest_end_date date,
  total_insurance_price numeric,
  policy_types text[],
  policy_ids uuid[],
  new_policies_count bigint,
  new_policy_ids uuid[],
  new_policy_types text[],
  new_total_price numeric,
  new_start_date date,
  has_package boolean,
  renewed_by_admin_id uuid,
  renewed_by_name text,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_month_start date;
  v_month_end date;
  v_policy_type public.policy_type_parent;
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
    SELECT
      p.id,
      p.client_id,
      p.car_id,
      p.policy_type_parent AS ptype,
      p.group_id,
      p.insurance_price,
      p.end_date,
      p.start_date
    FROM policies p
    WHERE p.end_date BETWEEN v_month_start AND v_month_end
      AND p.cancelled = false
      AND p.transferred = false
      AND p.deleted_at IS NULL
      AND (v_policy_type IS NULL OR p.policy_type_parent = v_policy_type)
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      AND (
        p_search IS NULL OR p_search = '' OR EXISTS (
          SELECT 1 FROM clients c
          WHERE c.id = p.client_id
            AND (
              c.full_name ILIKE '%' || p_search || '%'
              OR c.id_number ILIKE '%' || p_search || '%'
              OR c.phone_number ILIKE '%' || p_search || '%'
              OR c.file_number ILIKE '%' || p_search || '%'
            )
        )
      )
      AND EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id
          AND newer.car_id IS NOT DISTINCT FROM p.car_id
          AND newer.start_date > p.start_date
          AND newer.end_date > CURRENT_DATE
          AND newer.cancelled = false
          AND newer.transferred = false
          AND newer.deleted_at IS NULL
      )
  ),
  renewal_mappings AS (
    SELECT DISTINCT ON (ep.id)
      ep.id AS old_policy_id,
      ep.client_id,
      np.id AS new_policy_id,
      np.policy_type_parent AS new_ptype,
      np.insurance_price AS new_price,
      np.start_date AS new_start,
      np.group_id AS new_group_id,
      np.created_by_admin_id AS renewed_by
    FROM expiring_policies ep
    JOIN policies np ON 
      np.client_id = ep.client_id
      AND np.car_id IS NOT DISTINCT FROM ep.car_id
      AND np.start_date > ep.start_date
      AND np.end_date > CURRENT_DATE
      AND np.cancelled = false
      AND np.transferred = false
      AND np.deleted_at IS NULL
    ORDER BY ep.id, np.start_date ASC
  ),
  client_aggregates AS (
    SELECT
      ep.client_id,
      c.full_name AS client_name,
      c.file_number AS client_file_number,
      c.phone_number AS client_phone,
      COUNT(DISTINCT ep.id) AS policies_count,
      MIN(ep.end_date) AS earliest_end_date,
      COALESCE(SUM(ep.insurance_price), 0) AS total_insurance_price,
      ARRAY_AGG(DISTINCT ep.ptype::text) AS policy_types,
      ARRAY_AGG(DISTINCT ep.id) AS policy_ids,
      COUNT(DISTINCT rm.new_policy_id) AS new_policies_count,
      ARRAY_AGG(DISTINCT rm.new_policy_id) FILTER (WHERE rm.new_policy_id IS NOT NULL) AS new_policy_ids,
      ARRAY_AGG(DISTINCT rm.new_ptype::text) FILTER (WHERE rm.new_ptype IS NOT NULL) AS new_policy_types,
      COALESCE(SUM(DISTINCT rm.new_price) FILTER (WHERE rm.new_policy_id IS NOT NULL), 0) AS new_total_price,
      MIN(rm.new_start) AS new_start_date,
      bool_or(ep.group_id IS NOT NULL OR rm.new_group_id IS NOT NULL) AS has_package,
      (ARRAY_AGG(rm.renewed_by ORDER BY rm.new_start ASC) FILTER (WHERE rm.renewed_by IS NOT NULL))[1] AS renewed_by_admin_id
    FROM expiring_policies ep
    JOIN clients c ON c.id = ep.client_id
    LEFT JOIN renewal_mappings rm ON rm.old_policy_id = ep.id
    GROUP BY ep.client_id, c.full_name, c.file_number, c.phone_number
  )
  SELECT
    ca.client_id,
    ca.client_name,
    ca.client_file_number,
    ca.client_phone,
    ca.policies_count,
    ca.earliest_end_date,
    ca.total_insurance_price,
    ca.policy_types,
    ca.policy_ids,
    ca.new_policies_count,
    ca.new_policy_ids,
    ca.new_policy_types,
    ca.new_total_price,
    ca.new_start_date,
    ca.has_package,
    ca.renewed_by_admin_id,
    pr.full_name AS renewed_by_name,
    COUNT(*) OVER()::bigint AS total_count
  FROM client_aggregates ca
  LEFT JOIN profiles pr ON pr.id = ca.renewed_by_admin_id
  ORDER BY ca.earliest_end_date ASC, ca.client_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
