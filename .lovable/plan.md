

# Fix: Cheques Not Appearing After Adding from Cheques Page

## What Happened

The cheques you just added for "اشرف زياد ناصر" (9 cheques) went to the wrong table (`client_payments`) because your browser was running the old code. The Cheques page only reads from `policy_payments`, so they don't appear.

## What Will Be Done

### 1. Delete the 9 orphan cheque records from `client_payments`
- 9 records created today (2026-02-10) for اشرف زياد ناصر
- Cheque numbers: 80001255 through 80001262 (including duplicate 80001258)
- These are invisible and don't affect any balance

### 2. Fix `AddCustomerChequeModal.tsx` to be more robust
- Add `cheque_status: 'pending'` to every insert (currently missing)
- Add better error logging with `console.error` so issues are visible in logs
- Add a fallback: if no payable policies exist, still allow saving by assigning to the first active non-ELZAMI policy (even if fully paid) -- this prevents the "all paid" block for cases like this customer

### 3. After the fix
- You will need to re-enter the 9 cheques for اشرف زياد ناصر from the Cheques page
- They will save correctly to `policy_payments` and appear immediately
- They will properly deduct from the customer's wallet/balance

## Technical Details

| File | Change |
|------|--------|
| `src/components/cheques/AddCustomerChequeModal.tsx` | Add `cheque_status: 'pending'` to insert object, improve error handling |
| Database cleanup | Delete 9 orphan records from `client_payments` |

### Insert object fix (line ~271):
```typescript
// Before (missing cheque_status)
{ policy_id, amount, payment_type: 'cheque', ... }

// After
{ policy_id, amount, payment_type: 'cheque', cheque_status: 'pending', ... }
```
