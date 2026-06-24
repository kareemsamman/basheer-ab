-- ============================================================================
-- Renewals PDF: client-anchored month filter (supersedes 20260624120000)
-- ============================================================================
-- The report is grouped by CLIENT and renewals are done per-client (the إلزامي
-- and the ثالث/شامل of the same car are renewed together). Strictly scoping to
-- the selected month hid companion policies: e.g. تسنيم has إلزامي expiring in
-- June and ثالث expiring in July; filtering July showed only the ثالث and
-- dropped the June إلزامي even though they belong to the same renewal.
--
-- New rule (month mode):
--   * A client QUALIFIES for the report if they have at least one eligible
--     (not-yet-renewed) policy expiring in the SELECTED month.
--   * For qualifying clients we then list ALL their eligible policies expiring in
--     a window of [selected_month_start - 2 months, selected_month_end] so the
--     agent sees the whole nearby renewal cluster and can renew it in one go.
--   * Clients with NO policy in the selected month stay excluded (this is what
--     keeps the original "I picked July but got June-only clients" bug fixed).
--
-- Days mode (p_days_remaining IS NOT NULL) is unchanged: upcoming N days from
-- today, mirroring getRenewalDateRange() in PolicyReports.tsx.
--
-- Ordering stays end_date-first so the edge function (which groups by client via
-- Map insertion order) lists clients by urgency and policies by end_date.
-- ============================================================================

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
DECLARE
  v_month_start  date := date_trunc('month', p_end_month)::date;
  v_next_month   date := (date_trunc('month', p_end_month) + INTERVAL '1 month')::date;
  v_window_start date := (date_trunc('month', p_end_month) - INTERVAL '2 months')::date;
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT p.id, p.client_id AS cid, p.car_id, p.company_id,
           p.policy_type_parent, p.end_date AS edate, p.insurance_price
    FROM policies p
    WHERE p.cancelled = false AND p.transferred = false AND p.end_date IS NOT NULL
      AND p.policy_type_parent::text NOT IN ('ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION')
      AND NOT public.is_renewed(p.id)
      AND (p_policy_type IS NULL OR p.policy_type_parent::text = p_policy_type)
  ),
  -- Clients with at least one eligible policy expiring in the SELECTED month.
  qualifying_clients AS (
    SELECT DISTINCT e.cid
    FROM eligible e
    WHERE p_days_remaining IS NULL
      AND e.edate >= v_month_start
      AND e.edate <  v_next_month
  )
  SELECT
    e.id AS policy_id,
    c.id AS client_id,
    c.full_name AS client_name,
    c.file_number AS client_file_number,
    c.phone_number AS client_phone,
    car.car_number,
    e.policy_type_parent::text,
    ic.name_ar AS company_name_ar,
    e.edate AS end_date,
    (e.edate::date - CURRENT_DATE)::INTEGER AS days_remaining,
    COALESCE(e.insurance_price, 0) AS insurance_price,
    COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
  FROM eligible e
  INNER JOIN clients c ON c.id = e.cid
  LEFT JOIN cars car ON car.id = e.car_id
  LEFT JOIN insurance_companies ic ON ic.id = e.company_id
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = e.id
  WHERE
    CASE
      -- Month mode: qualifying clients, companion window = 2 months back .. selected month end
      WHEN p_days_remaining IS NULL THEN
        e.cid IN (SELECT qc.cid FROM qualifying_clients qc)
        AND e.edate >= v_window_start
        AND e.edate <  v_next_month
      -- Days mode: upcoming N days from today
      ELSE
        e.edate >= CURRENT_DATE
        AND e.edate <= (CURRENT_DATE + p_days_remaining)
    END
  ORDER BY e.edate ASC, c.full_name ASC;
END;
$$;
