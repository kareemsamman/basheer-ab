
CREATE OR REPLACE FUNCTION public.report_renewals_service_detailed(
  p_end_month date,
  p_days_remaining integer DEFAULT NULL,
  p_policy_type text DEFAULT NULL
)
RETURNS TABLE(
  policy_id uuid,
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  car_number text,
  policy_type_parent text,
  company_name_ar text,
  end_date date,
  days_remaining integer,
  insurance_price numeric,
  renewal_status text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS policy_id,
    c.id AS client_id,
    c.full_name AS client_name,
    c.file_number AS client_file_number,
    c.phone_number AS client_phone,
    car.car_number,
    p.policy_type_parent::text,
    ic.name_ar AS company_name_ar,
    p.end_date,
    (p.end_date::date - CURRENT_DATE)::INTEGER AS days_remaining,
    COALESCE(p.insurance_price, 0) AS insurance_price,
    COALESCE(prt.status, 'not_contacted') AS renewal_status
  FROM policies p
  INNER JOIN clients c ON c.id = p.client_id
  LEFT JOIN cars car ON car.id = p.car_id
  LEFT JOIN insurance_companies ic ON ic.id = p.company_id
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
  WHERE p.cancelled = false
    AND p.transferred = false
    AND p.end_date IS NOT NULL
    AND p.end_date >= CURRENT_DATE
    AND p.end_date < (p_end_month + INTERVAL '1 month')::DATE
    AND p.policy_type_parent::text NOT IN ('ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION')
    AND NOT EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.car_id IS NOT DISTINCT FROM p.car_id
        AND newer.cancelled = false
        AND newer.transferred = false
        AND newer.deleted_at IS NULL
        AND newer.start_date > p.start_date
        AND newer.end_date > CURRENT_DATE
    )
    AND (p_days_remaining IS NULL OR (p.end_date::date - CURRENT_DATE) <= p_days_remaining)
    AND (p_policy_type IS NULL OR p.policy_type_parent::text = p_policy_type)
  ORDER BY p.end_date ASC, c.full_name ASC;
END;
$$;
