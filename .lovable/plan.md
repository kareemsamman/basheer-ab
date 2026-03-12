

# Add Date Range Filter & Broker-Filtered Detail View to Company Settlement

## What the user wants
1. **Date range picker (from–to)** instead of only a month selector — so they can pick arbitrary date ranges
2. **When a broker is selected**, show the detailed policy-level table (like the `/reports/company-settlement/:companyId` detail page) instead of the summary-per-company view

## Changes — single file: `src/pages/CompanySettlement.tsx`

### 1. Replace month picker with from/to date pickers
- Add `dateFrom` and `dateTo` state variables (default empty = all time)
- Replace the `<Input type="month">` with two `ArabicDatePicker` components (من / إلى)
- Keep the "عرض كل الفترات" toggle — clicking it clears both dates
- Update `getDateRange()` to use `dateFrom`/`dateTo` directly instead of computing from month
- Update `getFilterDescription()` to show the date range text
- Remove `selectedMonth` state (replaced by the two dates)

### 2. When broker is filtered, show detailed policy rows
- Add new state: `detailedPolicies` array (same `PolicyDetail` interface as the detail page)
- Detect "broker mode": `const isBrokerFiltered = selectedBrokers.length > 0`
- When `isBrokerFiltered`, fetch individual policies (not just the RPC summary) — query `policies` table with joins to `clients`, `cars`, and `insurance_companies`, filtered by `broker_id IN selectedBrokers` + date range + company + category + cancelled filters
- Render a detailed table (client name, car number, insurance type, company, start/end dates, insurance price, company payment, profit) instead of the summary-per-company table
- Each row is clickable to open `PolicyDetailsDrawer`
- Summary cards still show totals computed from the detailed data
- When no broker filter is active, show the existing summary-per-company view as before

### 3. Update dependent calls
- `fetchFilteredCompanies()` and `fetchSettlementData()` already accept `p_start_date`/`p_end_date` — just pass the new date values
- CSV export: when in broker detail mode, export the detailed columns instead of summary columns

