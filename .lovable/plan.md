
# Fix X-Service Sync for Non-Visa Package Creation

## Problem

There are TWO code paths for creating package policies in `PolicyWizard.tsx`:

1. **Non-Visa path** (lines 828-883): Used when paying with cash/cheque/transfer -- this is what you used
2. **Visa/Tranzila path** (lines 886-1139): Used when paying with credit card

The previous fix only applied to path #2. Path #1 still has the old code:
- Line 861: `await supabase.from('policies').insert({...})` -- no `.select('id')`, no ID captured
- `_pkgFirstAddonType` and `_pkgMainAddonId` are declared with `var` inside the `else` block (path #2), so they're `undefined` in path #1
- The X-Service sync logic at line 1414 checks these variables but they're always `undefined` for non-Visa packages, so NO addon policies get synced

This is why the Road Service addon in your ELZAMI package was never sent to X-Service.

## Solution

### File: `src/components/policies/PolicyWizard.tsx`

**Change 1: Hoist tracking variables above both paths**

Move `_pkgFirstAddonType` and `_pkgMainAddonId` declarations from inside the Visa block (line 890-891) to BEFORE the if/else split, so both paths can use them.

**Change 2: Fix non-Visa addon insert to capture IDs**

At line 861, change:
```typescript
await supabase.from('policies').insert({ ...fields });
```
to:
```typescript
const { data: addonData, error: addonError } = await supabase
  .from('policies')
  .insert({ ...fields })
  .select('id')
  .single();

if (addonError) throw addonError;
(addon as any)._savedPolicyId = addonData?.id || null;
```

**Change 3: Track first addon type in non-Visa path**

The main policy created at line 793 uses the Step 3 type (e.g., ELZAMI). The addons are the package components. We need to know which addon types exist so the sync logic can find them. Set `_pkgFirstAddonType` to track what the main policy type is (since in non-Visa path, the main policy IS the Step 3 type, not converted).

In the non-Visa path, the main policy from Step 3 is already `policyIdToUse` (line 825). The addons created in the loop (lines 829-883) are the additional package components. The sync logic just needs `_savedPolicyId` on each addon to work.

## Technical Details

| What | Current (non-Visa path) | Fix |
|---|---|---|
| `_pkgFirstAddonType` | `undefined` (declared in else block) | Hoisted; set before both paths |
| `_pkgMainAddonId` | `undefined` (declared in else block) | Hoisted; not needed for non-Visa |
| Addon insert (line 861) | No `.select('id')`, no ID captured | `.select('id').single()` + store `_savedPolicyId` |
| Main policy (line 793) | Already has `.select().single()` | Already correct -- `policyIdToUse` is set |

The sync logic at line 1426-1433 will then find `addon._savedPolicyId` for ROAD_SERVICE/ACCIDENT_FEE addons and trigger `sync-to-xservice` for them.
