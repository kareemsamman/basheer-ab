# Dashboard & Financial Reports Fixes

## Issue 1: Company Debts Table - Number Alignment

The amounts in the "ديون شركات التأمين" table are centered (`text-center`) but should be left-aligned under the "المبلغ المستحق" header to match the screenshot style.

**Fix**: Change `text-center` to `text-left` for the amount column cells and header in the company debts table.

## Issue 2: Financial Reports - Start from 2026

The admin wants all financial data on `/reports/financial` (wallets, cheques, company debts, everything) to start from January 1, 2026 only. Currently the page fetches ALL historical data with no date filter.

**Changes needed:**

### Database

- Update `dashboard_company_debts` RPC to accept optional `p_from_date` and `p_to_date` parameters and pass them to `get_company_wallet_balance()`.

### Financial Reports Page (`src/pages/FinancialReports.tsx`)

- Add `p_from_date: '2026-01-01'` to all `get_company_balance` and `get_company_wallet_balance` RPC calls.
- Filter `policy_payments` query with `.gte('created_at', '2026-01-01')`.
- Filter `policies` query with `.gte('created_at', '2026-01-01')`.
- Filter `company_settlements` with `.gte('created_at', '2026-01-01')`.
- Filter `broker_settlements` with `.gte('created_at', '2026-01-01')`.
- Filter `customer_wallet_transactions` with `.gte('created_at', '2026-01-01')`.
- Filter `expenses` with `.gte('expense_date', '2026-01-01')`.
- Filter `ab_ledger` with `.gte('transaction_date', '2026-01-01')`.

This means the "AB Wallet" summary, company balances, profit totals, and all ledger entries will reflect from  2026 data only.

### Dashboard Company Debts

- Update the `dashboard_company_debts` RPC to pass `'2026-01-01'` as `p_from_date` to `get_company_wallet_balance`, so dashboard debts also reflect 2026 only.

## Files to Change


| File                             | Change                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| `src/pages/Dashboard.tsx`        | Fix amount alignment in company debts table (text-center to text-left) |
| `src/pages/FinancialReports.tsx` | Add `2026-01-01` date filter to all data queries                       |
| Database migration               | Update `dashboard_company_debts` to pass `p_from_date = '2026-01-01'`  |


## Technical Details

### Dashboard alignment fix

```tsx
// Change from text-center to text-left for amount cells
<TableHead className="text-left">المبلغ المستحق</TableHead>
<TableCell className="text-left ltr-nums">...</TableCell>
```

### Financial Reports date filter

All queries in `fetchFinancialData` will be filtered to `>= 2026-01-01`:

- Payments, policies, settlements, expenses, ledger entries
- Company balance RPCs called with `p_from_date: '2026-01-01'`  
`all the data will start from 2026 yeah not only for 2026 got me?`

### Dashboard company debts RPC

```sql
CREATE OR REPLACE FUNCTION dashboard_company_debts()
RETURNS TABLE(company_id uuid, company_name text, outstanding numeric) AS $$
BEGIN
  RETURN QUERY
  SELECT ic.id, COALESCE(ic.name_ar, ic.name)::text, w.outstanding
  FROM insurance_companies ic
  CROSS JOIN LATERAL get_company_wallet_balance(ic.id, '2026-01-01'::date) w
  WHERE w.outstanding > 0
  ORDER BY w.outstanding DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```