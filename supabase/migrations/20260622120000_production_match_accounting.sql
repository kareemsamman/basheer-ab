-- Align dashboard_company_production with the Accounting page (Accounting.tsx) logic so
-- the production report matches the المستحق للشركات / تفاصيل البوالص numbers there.
--
-- Two changes vs. the previous version:
--   1) Filter by issue_date (تاريخ الإصدار) instead of created_at (تاريخ الإدخال) —
--      the Accounting page filters policies by issue_date, so a policy issued one month
--      but entered in another must land in the issue month.
--   2) Zero out transferred policies in the amount sums (but still count them) —
--      Accounting sets payed_for_company = 0 for transferred policies in owedToCompany,
--      while تفاصيل البوالص still counts them.
-- Scope stays ثالث/شامل only (policy_type_parent = 'THIRD_FULL') and amount stays
-- payed_for_company, matching the report's existing definition.
CREATE OR REPLACE FUNCTION public.dashboard_company_production(p_start_date date, p_end_date date)
 RETURNS TABLE(company_id uuid, company_name text, third_count bigint, third_amount numeric, full_count bigint, full_amount numeric, total_count bigint, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ic.id as company_id,
    COALESCE(ic.name_ar, ic.name) as company_name,
    count(*) FILTER (WHERE p.policy_type_parent::text = 'THIRD_FULL' AND COALESCE(p.policy_type_child::text, 'THIRD') = 'THIRD') as third_count,
    COALESCE(sum(CASE WHEN p.transferred THEN 0 ELSE p.payed_for_company END) FILTER (WHERE p.policy_type_parent::text = 'THIRD_FULL' AND COALESCE(p.policy_type_child::text, 'THIRD') = 'THIRD'), 0) as third_amount,
    count(*) FILTER (WHERE p.policy_type_parent::text = 'THIRD_FULL' AND p.policy_type_child::text = 'FULL') as full_count,
    COALESCE(sum(CASE WHEN p.transferred THEN 0 ELSE p.payed_for_company END) FILTER (WHERE p.policy_type_parent::text = 'THIRD_FULL' AND p.policy_type_child::text = 'FULL'), 0) as full_amount,
    count(*) FILTER (WHERE p.policy_type_parent::text = 'THIRD_FULL') as total_count,
    COALESCE(sum(CASE WHEN p.transferred THEN 0 ELSE p.payed_for_company END) FILTER (WHERE p.policy_type_parent::text = 'THIRD_FULL'), 0) as total_amount
  FROM policies p
  JOIN insurance_companies ic ON ic.id = p.company_id
  WHERE p.cancelled = false
    AND p.deleted_at IS NULL
    AND p.issue_date BETWEEN p_start_date AND p_end_date
    AND p.policy_type_parent::text = 'THIRD_FULL'
  GROUP BY ic.id, ic.name_ar, ic.name
  ORDER BY total_count DESC;
END;
$function$;
