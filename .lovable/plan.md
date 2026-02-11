
# Fix: Office Commission Missing from Client Views + Auto-Refresh After Payment

## Problems

### Problem 1: "المبلغ" shows ₪1,200 instead of ₪1,400
The policy card in the client profile shows only `insurance_price` without adding `office_commission`. This affects multiple components that each have their own `PolicyRecord` interface and price calculations.

### Problem 2: Wallet/balance not refreshing after payment
After paying via the "دفع" button, the user must manually reload the page to see updated balances. The `onPaymentAdded` callback already triggers `fetchPaymentSummary()`, `fetchPayments()`, `fetchPolicies()`, and `fetchWalletBalance()`, but the `PackagePaymentModal` closes before the data re-fetches complete, and the `PolicyYearTimeline` internal payment cache doesn't update from the parent's refreshed data.

## Changes

### 1. ClientDetails.tsx - Fetch `office_commission` in queries
- Add `office_commission` to the `fetchPolicies` select query (line 434)
- Add `office_commission` to the `fetchPaymentSummary` select query (line 469)
- Include `office_commission` in `totalInsurance` calculation (line 481): `sum + insurance_price + (office_commission || 0)`

### 2. PolicyYearTimeline.tsx - Include commission in totals
- Add `office_commission: number | null` to the `PolicyRecord` interface (after line 53)
- Update `totalPrice` calculation (line 441) to: `sum + p.insurance_price + (p.office_commission || 0)`
- Update standalone policy `totalPrice` (line 465) to: `policy.insurance_price + (policy.office_commission || 0)`
- Update `debtPrice` calculation to include commission for ELZAMI policies
- Update `refreshPaymentInfo` remaining calc to include commission

### 3. PolicyTreeView.tsx - Include commission in totals
- Add `office_commission: number | null` to the `PolicyRecord` interface (after line 49)
- Update `getPackagePaymentStatus` (line 397): `totalPrice += policy.insurance_price + (policy.office_commission || 0)`
- Update `debtPrice` to include commission
- Update `refreshPaymentInfo` remaining calc (line 511) to include commission
- Update `totalPrice` calc at line 534 to include commission

### 4. PackagePaymentModal.tsx - Include commission in price/remaining
- Add `office_commission` to the `fetchPolicyPaymentInfo` select query (line 194)
- Update price calculation (line 218): `price: p.insurance_price + (p.office_commission || 0)`
- Update remaining calculation (line 220) accordingly

### 5. SinglePolicyPaymentModal.tsx - Accept commission in price
- Add `officeCommission?: number` prop
- Use `insurancePrice + (officeCommission || 0)` for total/remaining calculations
- Update call sites in PolicyTreeView and PolicyYearTimeline to pass commission

### 6. Auto-refresh after payment
- In `PackagePaymentModal` `onSuccess`, ensure the modal closes AFTER the parent refetch completes (currently `onSuccess` is called which triggers async fetches, but the modal closes immediately)
- Make `onSuccess` in `PolicyYearTimeline` and `PolicyTreeView` await the parent callback before closing the modal, or add a small delay to let refetches propagate

## Files to Change

| File | Change |
|------|--------|
| `src/components/clients/ClientDetails.tsx` | Add `office_commission` to select queries, include in totals |
| `src/components/clients/PolicyYearTimeline.tsx` | Add to interface, include in totalPrice/debtPrice calcs |
| `src/components/clients/PolicyTreeView.tsx` | Add to interface, include in all price calcs |
| `src/components/clients/PackagePaymentModal.tsx` | Fetch and include commission in price/remaining |
| `src/components/clients/SinglePolicyPaymentModal.tsx` | Accept and use commission in calculations |
