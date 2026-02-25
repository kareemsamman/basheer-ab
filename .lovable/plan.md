

# Fix Package Addon X-Service Sync + Service Name Matching

## Problem 1: Addon policies never synced to X-Service

When creating a package (e.g., ELZAMI main + Road Service addon), the addon policy inserts at lines 1065 and 1102 don't use `.select('id')` to capture the new policy ID. The X-Service sync code at line 1411-1422 checks `addon._savedPolicyId` which is **never set**, so addon policies are silently skipped.

## Problem 2: Service ID mismatch on remote X-Service

The error "Agent does not have an active service with service_id: d7785fc6-..." means the **remote** X-Service system doesn't recognize our local UUID. The sync already sends `service_name` for name-based fallback matching, but the remote side may not be using it. We should ensure `service_name` is always populated so the remote can match by name.

## Solution

### File: `src/components/policies/PolicyWizard.tsx`

**Change 1: Capture addon policy IDs on insert**

At line 1065, change the addon insert to use `.select('id')` and store the returned ID:

```typescript
const { data: addonData, error: addonError } = await supabase.from('policies').insert({
  // ... same fields ...
}).select('id').single();

if (addonError) throw addonError;

// Store the saved policy ID on the addon for X-Service sync
addon._savedPolicyId = addonData.id;
```

**Change 2: Capture main policy ID when created as addon**

At line 1102, similarly capture the ID for the main policy when it's created as an addon in a package:

```typescript
const { data: mainAddonData, error: mainAddonError } = await supabase.from('policies').insert({
  // ... same fields ...
}).select('id').single();

if (mainAddonError) throw mainAddonError;
```

Then add this main policy ID to the X-Service sync check (since the main policy could also be ROAD_SERVICE or ACCIDENT_FEE_EXEMPTION in some package configurations).

**Change 3: Also sync the temp policy if it was converted to an X-Service type**

The temp policy (line 1006-1022) gets updated to the first addon type. If that type is ROAD_SERVICE or ACCIDENT_FEE_EXEMPTION, it needs to be synced. The current code at line 1407 checks `mainType` (the Step 3 policy type), but the temp policy may have been converted to a different type. We need to also check `policyIdToUse` against the first addon type.

**Change 4: Collect all created policy IDs for X-Service sync**

Instead of relying on `addon._savedPolicyId`, build a proper collection:

```typescript
const allCreatedPolicyIds: Array<{id: string, type: string}> = [];

// Track temp policy (which becomes first addon)
allCreatedPolicyIds.push({ id: policyIdToUse, type: tempPolicyTypeParent });

// Track each addon insert
// ... push addon IDs as they're created ...

// Track main policy insert (if created)
// ... push main policy ID ...

// X-Service sync: filter to syncable types
const xserviceTypes = ['ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION'];
const policyIdsToSync = allCreatedPolicyIds
  .filter(p => xserviceTypes.includes(p.type))
  .map(p => p.id);
```

### Technical Summary

| What | Current | Fix |
|---|---|---|
| Addon insert (line 1065) | `.insert({...})` - no ID returned | `.insert({...}).select('id').single()` + store ID |
| Main addon insert (line 1102) | `.insert({...})` - no ID returned | `.insert({...}).select('id').single()` + store ID |
| X-Service sync (line 1402) | Checks `addon._savedPolicyId` (always undefined) | Use collected IDs from all inserts |
| Temp policy sync | Only checks `mainType` from Step 3 | Also check temp policy's converted type |

### No edge function changes needed

The `sync-to-xservice` function already sends both `service_id` and `service_name`. The "service not found" error is from the **remote** X-Service system -- that's an issue on the remote side's matching logic. Our fix ensures the sync is actually **triggered** for package addon policies.

