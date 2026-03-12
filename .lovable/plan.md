

# Fix: Remove Clients with Any New Active Policy from التجديدات

## Problem
Clients still appear in the التجديدات tab even though they have new 2026-2027 policies. The current logic only excludes expiring policies when a newer policy exists for the **same car**. But when a client has renewed with a different car (or the car changed), they still show up.

For example, client اشرف زياد ناصر shows in التجديدات with car 9410565 (expiring March 2026), but the client already has multiple new policies on other cars (8007131, 16007301, etc.) running until 2027. The user considers this client "renewed" and doesn't want them in the list.

## Solution
Remove the `car_id` constraint from the `NOT EXISTS` check. If a client has **any** newer active policy (regardless of which car), all their expiring policies should be excluded from التجديدات.

## Database Migration

### 1. Update `report_renewals` (paginated)
Change the NOT EXISTS clause from:
```sql
AND newer.car_id IS NOT DISTINCT FROM p.car_id
```
to no car_id check — just match by `client_id`.

### 2. Update `report_renewals_summary`
Same change in the `EXISTS` subquery — remove `car_id` matching.

### 3. Update `report_renewed_clients`
Same change in both the `expiring_policies` CTE and `renewal_mappings` join.

### 4. Update `report_renewals_service_detailed`
Same change — remove `car_id` matching.

### 5. Update `get_client_renewal_policies` (both overloads)
Both still have the OLD logic (`policy_type_parent` + `car_id`). Update to remove both constraints.

### 6. Update non-paginated `report_renewals`
Still has old `car_id = p.car_id` and `policy_type_parent` match. Update to match the new logic.

No frontend changes needed.

