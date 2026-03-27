

## Renewal Assistant & Follow-Up Page Overhaul

### Overview
Transform the renewals tab into a customer-centric monthly follow-up system with a guided "Renewal Assistant" popup and three sub-tabs (Pending / Renewed / Declined).

### Database Changes

**No new tables needed.** The existing `policy_renewal_tracking` table already has `renewal_status` (text), `notes`, `contacted_by`, and timestamps. We'll use:
- `pending` (or `not_contacted`/`sms_sent`/`called`) → pending renewal
- `renewed` → already exists
- `declined_renewal` → new status value, `notes` stores the reason

**Migration:** Update `report_renewals` RPC to exclude `renewed` and `declined_renewal` statuses from the pending list. Create a new `report_declined_renewals` RPC for the declined tab. Update `report_renewals_summary` to return unique customer counts instead of policy counts.

SQL changes:
1. Update `report_renewals` to add `WHERE renewal_status NOT IN ('renewed', 'declined_renewal')` filter
2. Create `report_declined_renewals(p_end_month, p_policy_type, p_created_by, p_search, p_page_size, p_page)` — returns clients whose ALL policies have `declined_renewal` status, including the decline reason
3. Update `report_renewals_summary` to count unique `client_id` values (not policy rows) for the main KPI

### Frontend Changes — `src/pages/PolicyReports.tsx`

**1. Tabs restructure (renewals only)**
- Keep top-level tabs: `الوثائق المنشأة` | `التجديدات` | `تم التجديد` (unchanged)
- Inside the `التجديدات` tab content, add 3 inner sub-tabs:
  - `بانتظار التجديد` (Pending) — current renewals table, minus renewed/declined
  - `تم التجديد` — stays as-is (the existing outer tab moves here? No — user said "تم التجديد will stay how it is now with no change")
  
  Actually re-reading: the user says the tabs `الوثائق المنشأة` and `تم التجديد` stay unchanged. Only the renewals tab gets sub-tabs:
  - Pending renewal (default)
  - Declined renewal (لا يرغبون بالتجديد)

**2. Renewal Assistant Popup**
- New state: `assistantOpen`, `assistantClients` (list of all pending clients for the month), `assistantIndex` (current customer index)
- On renewals tab load → auto-open the assistant popup (once per session/month)
- Button "فتح مساعد التجديد" in the toolbar to reopen manually
- Dialog shows current customer with:
  - Name, phone
  - Table of all their policies: policy number, car number, expiry date, price, company, policy type
- 4 action buttons:
  - **نعم، تم التجديد** → upsert `renewed` status for all client policies → remove from pending, move to next
  - **لا، ليس بعد** → keep `pending`/current status → move to next
  - **لا يرغب بالتجديد** → show reason textarea (required) → upsert `declined_renewal` with reason in `notes` → move to next
  - **تخطي** → no changes → move to next
- X button to close the assistant flow entirely
- Progress indicator: "عميل 3 من 28"

**3. Summary card update**
- Main number = unique customers still pending
- Secondary: `X عميل • ₪Y` where Y = total premium of their policies

**4. New "Declined" sub-tab**
- State: `declinedClients`, `declinedLoading`, pagination
- Table columns: Customer name, phone, policies count, total price, decline reason, declined by, date
- Fetched via `report_declined_renewals` RPC

### Implementation Steps

1. **DB migration**: Update `report_renewals` to exclude renewed/declined, create `report_declined_renewals` RPC, update summary to count customers
2. **Renewal Assistant component**: Build the popup dialog with customer-by-customer flow, policy details table, 4 action buttons, and reason input for declined
3. **Update PolicyReports.tsx**: Add assistant state/trigger, add "Open Assistant" button, add declined sub-tab within renewals, update summary card display
4. **Wire data**: Connect assistant actions to `policy_renewal_tracking` upserts, refresh data after each action

### Files Modified
- `src/pages/PolicyReports.tsx` — main page with assistant popup, sub-tabs, updated summary
- 1 new migration SQL — updated RPCs

