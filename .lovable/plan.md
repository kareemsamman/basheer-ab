

## Plan: Add Inline Edit (Pencil) Button to Main Company Settlement Page

### Problem
The main `/reports/company-settlement` page (detail mode with company filter) has Eye and Calculator buttons but is missing the **Pencil (edit)** button that exists on the `/reports/company-settlement/:id` detail page. Users need to edit `insurance_price`, `payed_for_company`, and `profit` inline.

### Changes — Single File: `src/pages/CompanySettlement.tsx`

1. **Add inline edit state** — Add `editingPolicyId`, `editValues`, `savingEdit` state variables (same pattern as `CompanySettlementDetail.tsx`).

2. **Add edit handlers** — `handleStartEdit(policy)`, `handleCancelEdit()`, `handleSaveEdit()` functions that update `insurance_price`, `payed_for_company`, `profit` in the `policies` table and refresh data.

3. **Make table cells editable** — For the المحصل (insurance_price), للشركة (payed_for_company), and الربح (profit) columns, show `Input` fields when `editingPolicyId` matches the row.

4. **Add Pencil button** — In the actions column, add a Pencil icon button between Eye and Calculator (when not editing). When editing, show Check (save) and X (cancel) buttons instead — matching the detail page pattern exactly.

### Technical Details
- Reuses the existing `Pencil` import (already imported on line 27)
- `Check` and `X` icons need to be added to the import
- Save function updates Supabase `policies` table then calls `fetchBrokerPolicies()` to refresh
- Edit inputs use `w-20 h-8 text-sm` styling for compact inline editing

