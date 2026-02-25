
# Dashboard Fixes and Additions

## Problems Identified

1. **Debt card shows 0**: The `dashboard_total_client_debt` RPC uses its own flawed calculation that doesn't match the debt-tracking page. The debt-tracking page uses `get_client_balance()` (which includes `office_commission` and wallet refunds). The dashboard RPC misses these.

2. **No production summary card**: The production table exists but there's no summary card above it showing totals.

3. **No company debts table**: Need a table similar to the production table showing how much is owed to each insurance company.

## Solution

### 1. Fix `dashboard_total_client_debt` RPC

Replace the current broken RPC with one that uses `report_client_debts_summary` (the same source as the debt-tracking page):

```sql
CREATE OR REPLACE FUNCTION dashboard_total_client_debt()
RETURNS numeric AS $$
DECLARE v_total numeric;
BEGIN
  SELECT total_remaining INTO v_total
  FROM report_client_debts_summary(NULL::text, NULL::integer);
  RETURN COALESCE(v_total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

This ensures both pages show the same ₪31,540 value.

### 2. Add production summary card

Above the production table, add a summary card showing:
- Total policies count
- Total amount (₪)

Uses the already-calculated `productionTotals` from the existing code.

### 3. Add company debts table

Create a new RPC `dashboard_company_debts` that calls `get_company_wallet_balance()` for each company and returns company name + outstanding amount. Render as a table similar to the production table, with columns: Company | Outstanding Amount.

```sql
CREATE OR REPLACE FUNCTION dashboard_company_debts()
RETURNS TABLE(company_id uuid, company_name text, outstanding numeric)
AS $$
BEGIN
  RETURN QUERY
  SELECT ic.id, COALESCE(ic.name_ar, ic.name)::text, w.outstanding
  FROM insurance_companies ic
  CROSS JOIN LATERAL get_company_wallet_balance(ic.id) w
  WHERE w.outstanding > 0
  ORDER BY w.outstanding DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

### 4. Dashboard.tsx UI changes

**Row 2 (admin)**: Replace the current 2-card row with:
- Production summary card (total count + total amount from production data)
- Company debt total card (sum of all company outstanding)

**Row 3**: Keep existing production table as-is.

**Row 4 (new)**: Add "ديون شركات التأمين" table:

| الشركة | المبلغ المستحق |
|--------|---------------|
| ترست | ₪600,241 |
| اراضي مقدسة | ₪573,845 |
| ... | ... |
| **المجموع** | **₪X** |

## Files Changed

| File | Change |
|---|---|
| Database migration | Fix `dashboard_total_client_debt` to use `report_client_debts_summary` |
| Database migration | Create `dashboard_company_debts` RPC |
| `src/pages/Dashboard.tsx` | Add production summary card, add company debts table, wire up new RPC |
