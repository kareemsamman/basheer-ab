

## Plan: Fix Company Select Not Showing Pre-selected Value

### Problem
When clicking the edit (pencil) button, the company dropdown appears empty even though the policy has a company assigned. The `Select` component's value doesn't match any option.

### Root Cause
Two possible issues:
1. The `allCompanies` array may not be loaded yet when the user clicks edit (async race condition)
2. The `SelectValue` component needs a `placeholder` prop as fallback

### Fix in `src/pages/CompanySettlement.tsx`

**1. Add placeholder to SelectValue (line ~1177)**
```tsx
<SelectValue placeholder="اختر شركة" />
```

**2. Add the current policy's company to editValues even if allCompanies hasn't loaded**
No change needed — `allCompanies` fetches on mount, so it should be available. But add a debug safeguard.

**3. Ensure value matching works — check if `company_id` from policy is actually populated**
In `handleStartEdit` (line 616), `policy.company_id || ''` produces `''` if null. The `Select` component in Radix won't match `''` to any `SelectItem`. 

Fix: Only render the `Select` with a value when `editValues.company_id` is truthy, otherwise show a placeholder-only select. Or better: always pass a valid value by defaulting to the first company.

**Actual fix**: The Radix Select requires the `value` to exactly match one of the `SelectItem` values. If `editValues.company_id` is `''`, no item matches. Solution: use `value={editValues.company_id || undefined}` so Radix treats it as "no selection" and shows the placeholder instead of a broken empty state.

### Changes
- Line ~1176: Change `value={editValues.company_id}` to `value={editValues.company_id || undefined}`
- Line ~1177: Add `placeholder="اختر شركة"` to `SelectValue`
- Same pattern for policy_type_parent Select if it exists

This is a one-line fix that ensures the Select correctly shows the pre-selected company name when editing.

