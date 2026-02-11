
# Fix: DebtPaymentModal Not Including Office Commission

## Problem
When opening the bulk "دفع" (Pay) modal from the client profile, ELZAMI policies with office commission (e.g., ₪1,200 insurance + ₪100 commission) show as "لا توجد ديون مستحقة" (No outstanding debts) because the modal's debt calculation ignores `office_commission`.

The root cause is in `DebtPaymentModal.tsx`:
1. The Supabase query (line 272) doesn't fetch `office_commission`
2. All price/remaining calculations use only `insurance_price`
3. Since ELZAMI's `insurance_price` is fully covered by the auto-locked payment, and `office_commission` isn't counted, the system thinks there's no debt

## Changes

### File: `src/components/debt/DebtPaymentModal.tsx`

**1. Fetch `office_commission` in the query (line 272)**
Add `office_commission` to the `.select()` string.

**2. Include commission in policy component price (lines 319-327)**
Change `price: p.insurance_price` to `price: p.insurance_price + (p.office_commission || 0)` and update `remaining` accordingly.

This single change propagates through all downstream calculations (`fullPrice`, `nonElzamiPrice`, `remainingTotal`, `payablePolicies`) since they all derive from the component's `price` field.

**3. Handle ELZAMI office commission as payable debt**
Currently, ELZAMI policies are excluded from `nonElzamiPrice` and `payablePolicies`. However, the office commission portion of ELZAMI IS client debt. The fix:
- Keep ELZAMI `insurance_price` excluded from client debt (business rule)
- But include `office_commission` as payable debt

This means the `nonElzamiPrice` calculation needs to add ELZAMI's `office_commission` (but not its `insurance_price`):
```
const nonElzamiPrice = policyComponents
  .filter(p => p.policyType !== 'ELZAMI')
  .reduce((sum, p) => sum + p.price, 0)
  + policyComponents
    .filter(p => p.policyType === 'ELZAMI')
    .reduce((sum, p) => sum + (p.officeCommission || 0), 0);
```

And payable policies should include ELZAMI if it has unpaid office commission.

| File | Change |
|------|--------|
| `src/components/debt/DebtPaymentModal.tsx` | Fetch `office_commission`, include in price calcs, make ELZAMI commission payable |
