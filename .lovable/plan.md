

# Fix: Auto-detect Renewed Clients in التجديدات Tab

## Problem
The `report_renewals` RPC excludes policies from التجديدات only if a newer policy exists for the **same client + same car + same policy_type_parent**. But when a client renews with a different package composition (e.g., old: ELZAMI + THIRD_FULL + ROAD_SERVICE → new: THIRD_FULL + ROAD_SERVICE + ACCIDENT_FEE), the old ELZAMI has no matching newer ELZAMI, so the client still appears in التجديدات.

For example, جمال محمد داري:
- Old standalone policies ending Feb-Mar 2026: ELZAMI, THIRD_FULL, ROAD_SERVICE
- New package starting 2026-02-03: THIRD_FULL, ROAD_SERVICE, ACCIDENT_FEE_EXEMPTION
- The THIRD_FULL and ROAD_SERVICE are correctly excluded, but ELZAMI is not — so the client still shows.

## Solution
Update the `NOT EXISTS` clause in the `report_renewals` database function to check if the **client has ANY newer active policy for the same car**, regardless of policy type. If a client renewed their car insurance (any type), all expiring policies for that car should be excluded.

Similarly update `report_renewals_summary` and `report_renewed_clients` to use the same broader matching logic.

## Changes

### 1. Database Migration — Update `report_renewals` function
Modify the `NOT EXISTS` clause from:
```sql
AND newer.policy_type_parent = p.policy_type_parent
```
to remove this line, so it becomes:
```sql
AND NOT EXISTS (
  SELECT 1 FROM policies newer
  WHERE newer.client_id = p.client_id
    AND newer.car_id IS NOT DISTINCT FROM p.car_id
    AND newer.deleted_at IS NULL
    AND newer.cancelled = false
    AND newer.transferred = false
    AND newer.start_date > p.start_date
    AND newer.end_date > CURRENT_DATE
)
```

### 2. Database Migration — Update `report_renewed_clients` function
Same change to the `EXISTS` clause in the `expiring_policies` CTE and the `renewal_mappings` join — broaden matching to client+car only (no policy_type_parent constraint).

### 3. Database Migration — Update `report_renewals_summary` function
Apply the same broader matching logic so summary counts stay consistent with the renewals list.

### 4. No frontend changes needed
The UI already handles both tabs correctly — this is purely a database logic fix.

