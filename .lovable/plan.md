

# Fix Company Settlement: Date Consistency + Exclude ELZAMI from Totals

## Problems Found

1. **Totals mismatch between list and detail pages**: The `report_company_settlement` RPC filters by `start_date`, but the detail page (`CompanySettlementDetail`) filters by `issue_date`. Since `issue_date` is the accounting-period field, they show different results.

2. **ELZAMI included in counts and totals**: The RPC includes ELZAMI policies in `policy_count`, `total_insurance_price`, and `total_company_payment`. Per business rules, ELZAMI should be excluded from settlement summaries — the money goes directly to the company and is not part of the agency's collection/settlement flow.

## Changes

### 1. Update `report_company_settlement` RPC (SQL migration)
- Change date filter from `p.start_date` to `p.issue_date` to match the detail page
- Add `AND p.policy_type_parent != 'ELZAMI'` to exclude ELZAMI from counts and totals

### 2. Update `report_company_settlement_company_options` RPC (SQL migration)
- Same two changes: use `issue_date` instead of `start_date`, exclude ELZAMI

### 3. Update `CompanySettlementDetail.tsx` summary calculation
- Exclude ELZAMI policies from `totalInsurancePrice`, `totalCompanyPayment`, `totalProfit`, and `totalPolicies` in the `summary` useMemo (lines 243-263), so the summary cards match what the list page shows.

No frontend file changes needed for the date filter since the detail page already uses `issue_date`. The only frontend change is the summary exclusion of ELZAMI in the detail page.

