

## Problem Analysis

**Root Cause**: When `tranzila-init` creates a payment record, it sets `refused: null` (pending). Throughout the entire codebase, payments are filtered with `!p.refused` — in JavaScript, `!null === true`, so **pending payments with `refused: null` are counted as paid**. Same in SQL: `refused IS NOT TRUE` includes `null`.

This means the moment the payment record is created (before the user even enters their card), the amount is already counted as "paid" in all calculations — debt, wallet, policy details, etc.

**Flow**:
1. User clicks "Pay via Visa" → `tranzila-init` creates payment with `refused: null`
2. Payment immediately counts as paid everywhere (`!null === true`)
3. Tranzila returns failure (code 004) → `payment-result` sets `refused: true`
4. But if the page doesn't load, postMessage fails, or webhook doesn't fire → payment stays `refused: null` → permanently counted as paid

## Solution

### 1. Fix `tranzila-init` — Create payment as refused by default
Change `refused: null` → `refused: true` when creating the pending payment. This ensures it **never counts as paid** until explicitly confirmed by Tranzila success.

### 2. Fix `payment-result` — Only set `refused: false` on confirmed success
Already works correctly, but also add a guard: if `tranzila_response_code` is already set, skip update (already handled).

### 3. Fix `tranzila-webhook` — Same guard
Already sets `refused: false` on success, `refused: true` on failure. No change needed.

### 4. Fix `tranzila-broker-init` — Same pattern
Check if broker init also creates with `refused: null` and fix to `refused: true`.

### 5. Fix frontend `onFailure` cleanup
When modal is cancelled/closed without success, delete the pending payment record from the database to prevent orphaned records.

### 6. Fix `tranzila-status` polling
Update the status check: treat `refused: null` as pending (already correct), but ensure it doesn't trigger success.

### Files to modify:
- `supabase/functions/tranzila-init/index.ts` — line 109: `refused: null` → `refused: true`
- `supabase/functions/tranzila-broker-init/index.ts` — same fix
- `src/components/payments/TranzilaPaymentModal.tsx` — add cleanup of payment record on cancel/failure
- `src/components/brokers/BrokerPaymentModal.tsx` — add cleanup of settlement record on cancel/failure

### Impact
This is a one-line core fix (`refused: true` instead of `null`) that prevents any failed/pending Tranzila payment from ever being counted as paid. The payment will only count once Tranzila confirms success and `payment-result` sets `refused: false`.

