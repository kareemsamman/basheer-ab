

## Plan: Add Company Editing to Package Policy Edit Modal

### What Changes

Currently, the package edit modal shows the company name as read-only text for each policy. This plan adds a company dropdown selector per policy, allowing you to change the company for any policy in the package. When saved, the new `company_id` is persisted and profit is recalculated using the new company.

### Technical Details

**File: `src/components/policies/PackagePolicyEditModal.tsx`**

1. **Extend `EditState`** to include `companyId: string` field.

2. **Add state for available companies** per policy type:
   - On modal open, fetch companies from `insurance_companies` filtered by `category_parent` for each unique policy type in the package.
   - For `ROAD_SERVICE` policies, fetch from `road_services` table.
   - For `ACCIDENT_FEE_EXEMPTION`, fetch from `accident_fee_services` table.
   - Store in a `companyOptions: Record<string, Array<{id, name}>>` keyed by policy type.

3. **Replace the static company text** (line 609-611) with a `<Select>` dropdown:
   - For standard policies (ELZAMI, THIRD_FULL): show companies from `insurance_companies`.
   - For ROAD_SERVICE: show road service providers.
   - For ACCIDENT_FEE_EXEMPTION: show accident fee service providers.

4. **Update `handleSaveAll`** (line 516-527):
   - Include `company_id` in the update payload for standard policies.
   - Include `road_service_id` for ROAD_SERVICE policies.
   - Include `accident_fee_service_id` for ACCIDENT_FEE_EXEMPTION policies.
   - Use the new company ID when calling `calculatePolicyProfit` and fetching cost prices.

5. **Trigger X-Service re-sync** for ROAD_SERVICE / ACCIDENT_FEE_EXEMPTION policies whose company changed, by invoking `sync-to-xservice` after save.

### Summary of Changes
- 1 file modified: `src/components/policies/PackagePolicyEditModal.tsx`
- Company selector per policy in package edit modal
- Profit recalculated with new company on save
- X-Service re-sync triggered when service company changes

