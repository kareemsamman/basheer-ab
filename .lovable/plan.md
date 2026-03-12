

# Filter Dashboard Company Debts & Company Settlement from 2026-01-01

## Problem
The "الدين لدى شركات التأمين" section on the Dashboard and the Company Settlement page (`/reports/company-settlement`) currently can show policies from before 2026-01-01. They should be restricted to only include policies starting from 01/01/2026, consistent with the system's financial fresh-start date.

## Changes

### 1. Dashboard — `dashboard_company_debts` RPC
The RPC already passes `'2026-01-01'` to `get_company_wallet_balance`, so this is **already filtered correctly**. No change needed here.

### 2. Company Settlement — `getDateRange()` in `src/pages/CompanySettlement.tsx`
When `showAllTime` is true, it currently returns `{ startDate: null, endDate: null }` (no date filter). Change this to return `startDate: '2026-01-01'` instead of `null`, so the "all time" mode still enforces the 2026 boundary.

**File**: `src/pages/CompanySettlement.tsx`, line ~178
```typescript
const getDateRange = () => {
  if (showAllTime) {
    return { startDate: '2026-01-01', endDate: null };
  }
  // ... existing month logic
};
```

This single change ensures both `fetchFilteredCompanies` and `fetchSettlementData` (which both call `getDateRange()`) will always filter from 2026-01-01 minimum. No SQL migration needed.

### 3. CompanySettlementDetail page
Also check and apply the same `2026-01-01` floor when fetching individual company policies (the detail page at `/reports/company-settlement/:id`). Will review `fetchCompanyAndPolicies()` and add a `.gte('start_date', '2026-01-01')` filter if not already present.

