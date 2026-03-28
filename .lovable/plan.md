
Goal: fix the “failed to fetch” error in **/reports/policies → التجديدات** (Renewals), specifically in the **Renewal Assistant** popup.

1) Root-cause fix in assistant data query
- File: `src/components/reports/RenewalAssistant.tsx`
- Replace the invalid filter:
  - Current (broken): `.neq('status', 'cancelled')`
  - Problem: `policies` table has no `status` column, so query fails and the popup shows “no customers”.
- Use valid active-policy filters that match existing renewals logic:
  - keep `.is('deleted_at', null)`
  - exclude cancelled/transferred policies via the real boolean columns (e.g. `cancelled`, `transferred`).

2) Align assistant eligibility with renewals page behavior
- Ensure assistant pulls the same “pending follow-up” population as the renewals tab:
  - same selected month range
  - exclude clients already marked in `renewal_followups` as:
    - `renewed`
    - `declined_renewal`
- Keep grouping by **client** and include all their month policies.

3) Improve error-state UX (to avoid false “completed” state)
- In `RenewalAssistant.tsx`, add explicit error state:
  - if fetch fails, show an error panel with retry button (instead of showing “تم الانتهاء” with empty list).
  - keep toast, but make UI state accurate.

4) Validation pass after implementation
- Open `/reports/policies` → `التجديدات` with month `2026-03` and `2026-02`.
- Confirm:
  - no “failed to fetch follow-up data” toast on load
  - assistant lists customers (not empty when table has pending records)
  - “نعم، تم التجديد” removes client from pending list
  - “لا يريد التجديد” requires reason and moves client to declined tab
  - “لا، لم يجدد بعد” keeps client pending
  - “تخطي” changes nothing.

Technical details
- Confirmed from schema: `public.policies` has `cancelled` and `transferred` booleans, not `status`.
- This is a frontend query bug (no DB migration required).
- Main changes are isolated to: `src/components/reports/RenewalAssistant.tsx`.
