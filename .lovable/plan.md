

# Fix Package Payment Splitting — Insert 1 Record Per Cheque, Not Split Across Components

## Problem
When paying for a package policy (e.g., شامل ₪3,700 + خدمات طريق ₪500 = ₪4,200) with 3 cheques of ₪1,400 each, `PackagePaymentModal` proportionally splits each cheque across the 2 component policies, creating **6 payment records** (₪1,233 + ₪167 per cheque). The user expects **3 records** — one per cheque.

## Root Cause
`PackagePaymentModal.handleSubmit` calls `calculateSplitPayments()` which distributes each payment proportionally by remaining balance across all package component policies.

## Solution

### 1. Update the DB trigger to validate across the entire package group
**Migration SQL** — Change the existing payment total check in `validate_policy_payment_total()` so that when a policy belongs to a group, `v_existing_total` sums payments across **all** policies in that group (not just `NEW.policy_id`).

Current trigger (line 42-48) only sums `pp.policy_id = NEW.policy_id`. Updated version:
```sql
IF v_group_id IS NOT NULL THEN
  -- Sum payments across ALL policies in the package
  SELECT COALESCE(SUM(pp.amount), 0) INTO v_existing_total
  FROM policy_payments pp
  JOIN policies pol ON pol.id = pp.policy_id
  WHERE pol.group_id = v_group_id
    AND pol.deleted_at IS NULL
    AND COALESCE(pp.refused, false) = false
    AND (TG_OP <> 'UPDATE' OR pp.id <> NEW.id);
ELSE
  -- Single policy: sum only for that policy
  SELECT COALESCE(SUM(pp.amount), 0) INTO v_existing_total ...
END IF;
```

### 2. Update `PackagePaymentModal.handleSubmit` — Stop splitting, insert 1 record per payment
**File:** `src/components/clients/PackagePaymentModal.tsx`

Instead of calling `calculateSplitPayments()` and looping over splits, insert each payment line as a **single record** against the primary (first) policy in the package. Add `batch_id` to group them. Include `cheque_image_url` for cheque payments.

Key changes in `handleSubmit` (lines 448-496):
- Generate a `batch_id` for all payments in this batch
- Pick the primary policy ID (first policy with remaining, or first overall)
- Insert one `policy_payments` record per payment line (no split loop)
- Include `cheque_image_url` from scanned cheques
- Upload images for each payment

### 3. Update `handleScannedCheques` to preserve `cheque_image_url`
**File:** `src/components/clients/PackagePaymentModal.tsx`

The scanned cheque handler (line 324-356) doesn't preserve the CDN `image_url` from the scanner. Add `cheque_image_url: cheque.image_url` to the payment line (same pattern as `PolicyPaymentsSection`).

### Files Changed
| File | Change |
|---|---|
| DB migration (SQL) | Update trigger to sum across package group |
| `src/components/clients/PackagePaymentModal.tsx` | Stop proportional split; insert 1 record per payment against primary policy with batch_id + cheque_image_url |

