

# Sync ALL Policies to X-Service + Fix Counts

## Current Problems

1. **Only 76 out of 1,385 policies are eligible** because the filter requires `road_service_id` or `accident_fee_service_id` to be set. The 1,309 legacy WordPress imports don't have these IDs -- but the user wants ALL of them synced.

2. **"Already synced 127" is stale/wrong** -- the sync log has 127 success entries from previous attempts, but the user plans to clear X-Service data and re-sync everything. There's no way to reset the local sync log.

3. **After clearing X-Service data**, the local sync log still shows 127 successes, so it skips those policies thinking they're already synced.

## Data Reality

| Category | Count |
|---|---|
| Total ROAD_SERVICE policies (not deleted) | 1,380 |
| Total ACCIDENT_FEE policies (not deleted) | 5 |
| Have service_id | 76 |
| No service_id (legacy WP imports) | 1,309 |
| Sync log "success" entries | 127 |

## Solution

### Change 1: Remove service_id filter from bulk sync

**File: `supabase/functions/bulk-sync-to-xservice/index.ts`**

Remove the `.or("road_service_id.not.is.null,accident_fee_service_id.not.is.null")` filter from both the count query and batch query. ALL ROAD_SERVICE and ACCIDENT_FEE policies should be eligible for sync, even without a specific service_id. X-Service should handle matching by type.

### Change 2: Add "Clear Sync Log" alongside "Clear X-Service Data"

**File: `src/pages/XServiceSettings.tsx`**

When the user clicks "مسح بيانات X-Service" (Clear X-Service Data), ALSO clear the local `xservice_sync_log` table. This resets the "already synced" counter to 0 so all policies become eligible again.

Add a confirmation that explains: "This will clear X-Service data AND reset the local sync log so all policies can be re-synced."

### Change 3: Update eligible count (remove service_id filter)

**File: `src/pages/XServiceSettings.tsx`**

In `fetchEligibleCount()`, remove the `.or("road_service_id.not.is.null,accident_fee_service_id.not.is.null")` filter so the count reflects ALL service-type policies (1,385 total).

### Change 4: Show total vs synced breakdown

**File: `src/pages/XServiceSettings.tsx`**

Show clearer stats:
- Total service policies: 1,385
- Already synced: 127 (with option to reset)
- Remaining to sync: 1,258

## Technical Summary

| File | Change |
|---|---|
| `bulk-sync-to-xservice/index.ts` | Remove `service_id IS NOT NULL` filter from count + batch queries |
| `XServiceSettings.tsx` | Remove service_id filter from `fetchEligibleCount`; clear sync log when clearing X-Service data; show total/synced/remaining breakdown |

## Result After Fix

- Eligible count shows ~1,385 (or ~1,258 after subtracting synced)
- Clearing X-Service data also resets local sync log
- Re-sync sends ALL policies including legacy ones without service_id
- Policies without service_id are sent with `service_id: null` and `service_name: null` -- X-Service handles matching by type
