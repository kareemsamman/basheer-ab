-- ============================================================================
-- Fix: renewals PDF report must respect the selected month filter
-- ============================================================================
-- Bug: report_renewals_service_detailed used `end_date >= CURRENT_DATE` as the
-- lower bound and `end_date < (p_end_month + 1 month)` as the upper bound. So
-- selecting a future month (e.g. شهر 7 / 2026-07) produced a report covering
-- "today .. end of the selected month" — i.e. it leaked the tail of the CURRENT
-- month (June rows) into a report the user asked to scope to July, and those
-- earlier rows sorted to the top so the report looked unsorted.
--
-- The on-screen renewals list (report_renewals, driven by getRenewalDateRange in
-- PolicyReports.tsx) already does the right thing:
--   * month mode  -> [month_start, month_end]            (the whole selected month)
--   * days  mode  -> [today, today + N days]
-- We bring the PDF function in line with that exact behaviour, keyed on whether a
-- days filter was supplied (p_days_remaining IS NULL => month mode).
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
    AND p.policy_type_parent::text NOT IN ('ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION')
    AND NOT public.is_renewed(p.id)
    AND (p_policy_type IS NULL OR p.policy_type_parent::text = p_policy_type)
    AND (
      CASE
        -- Month mode: scope strictly to the selected month [month_start, month_end]
        WHEN p_days_remaining IS NULL THEN
          p.end_date >= date_trunc('month', p_end_month)::date
          AND p.end_date < (date_trunc('month', p_end_month) + INTERVAL '1 month')::date
        -- Days mode: upcoming N days from today (mirrors getRenewalDateRange)
        ELSE
          p.end_date >= CURRENT_DATE
          AND p.end_date <= (CURRENT_DATE + p_days_remaining)
      END
    )
  ORDER BY p.end_date ASC, c.full_name ASC;
END;
$$;
