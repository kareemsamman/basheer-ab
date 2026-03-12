

# Fix Expenses Page: סند صرف Logic, Invoice Columns, Remove Company Dues Tab

## Problem Summary
1. **سند صرف (Payment vouchers)** currently shows auto-generated entries for every policy's company payment (`payed_for_company`). These should NOT appear here — only manual expenses from the `expenses` table should show (e.g., rent, salaries, or payments made via company/broker wallet).
2. **Hebrew invoice print** has wrong column order — the name (גורם) should come right after שורה, before פרטים.
3. **"المستحق للشركات" tab** should be removed entirely.

## Changes

### 1. Remove company dues from Expenses page (`src/pages/Expenses.tsx`)
- Remove Query 3 (`companyDuesResult`) that fetches policies with `payed_for_company > 0` — these are not actual expenses AB paid, they're liabilities.
- Remove `companyDueExpenses` array and its merge into `allExpenses`.
- Remove `totalCompanyDues` state and its calculation.
- Remove the `company_dues` tab (`TabsTrigger value="company_dues"`).
- Remove `shouldFetchCompanyDues` logic.
- Clean up `netMonth` calculation (remove `- totalCompanyDues`).

### 2. Fix invoice column order (`src/lib/expenseInvoiceBuilder.ts`)
- Reorder table header: שורה → גורם → פרטים → קטגוריה → אמצעי תשלום → תאריך → סכום
- Reorder table row cells to match: row number → `contact_name` → `description` → category → payment method → date → amount

### 3. Remove "المستحق للشركات" tab UI
- Remove the `TabsTrigger` for `company_dues` from the tabs list.
- Remove the summary card for company dues if present.

