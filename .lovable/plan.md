
# Fix: DB Trigger Bug + Explanation of ₪1,500 → ₪1,300 Discrepancy

## What Happened (Past Payment)

The package for car 21212121 has:
- ELZAMI: ₪1,200 insurance + ₪300 office commission = ₪1,500 effective
- THIRD: ₪1,200 insurance = ₪1,200 effective
- Total: ₪2,700

When you created this policy, the **old code** did not include `office_commission` in the package total. So the system saw the total as ₪2,400 (1,200 + 1,200) instead of ₪2,700. The database validation trigger blocked the ₪1,500 payment because ₪1,200 (auto-lock) + ₪1,500 = ₪2,700 exceeded the old limit of ₪2,400. The system adjusted to ₪1,300 to fit.

The ₪200 remaining now (₪2,700 - ₪2,500 paid) is correct -- it's the unfunded portion of the office commission. You can pay ₪200 to settle it.

**This is already fixed** for future payments by the commission changes we made.

## Remaining Bug: Trigger Validation for Packages

There is still a bug in the `validate_policy_payment_total` trigger. When a policy is part of a package (group), it correctly uses the **group total** as the price limit, but it only sums **existing payments on the single policy being paid**, not across all policies in the group.

This means someone could theoretically overpay the package by adding excessive payments to different individual policies.

### Fix: Update trigger to sum payments across all group policies

```sql
-- When group_id is set, sum payments across ALL policies in the group
IF v_group_id IS NOT NULL THEN
  SELECT COALESCE(SUM(pp.amount), 0)
  INTO v_existing_total
  FROM public.policy_payments pp
  JOIN public.policies pkg ON pkg.id = pp.policy_id
  WHERE pkg.group_id = v_group_id
    AND pkg.deleted_at IS NULL
    AND COALESCE(pp.refused, false) = false
    AND (TG_OP <> 'UPDATE' OR pp.id <> NEW.id);
END IF;
```

## Changes

| File | Change |
|------|--------|
| DB Migration | Fix `validate_policy_payment_total()` to sum payments across all policies in the package group, not just the target policy |
