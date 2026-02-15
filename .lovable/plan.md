
# Fix: Package Visa Payment Assigns Wrong Price to Temp Policy

## The Bug
When creating a package with Visa payment where the main policy is ELZAMI:
1. Temp policy is created as THIRD_FULL (first enabled addon, since ELZAMI is the main)
2. On save, the temp policy gets updated with `mainInsurancePrice` (3,895 = ELZAMI price)
3. But it should get the THIRD addon price (1,500)
4. ELZAMI is then created separately with correct price (3,895)
5. Result: THIRD shows 3,895 instead of 1,500

## The Fix

### File: `src/components/policies/PolicyWizard.tsx` (lines ~938-971)

In the Visa package flow, after creating the group, the temp policy update must use the **addon's price** (not the main policy price):

**Before (buggy):**
```
const mainInsurancePrice = parseFloat(policy.insurance_price) || 0;
// ... profit calc using mainInsurancePrice ...
.update({ insurance_price: mainInsurancePrice, ... })
```

**After (fixed):**
```
// The temp policy was created as the first enabled addon, so update it with THAT addon's price
const firstAddonPrice = firstAddon ? parseFloat(firstAddon.insurance_price) || 0 : parseFloat(policy.insurance_price) || 0;

// Recalculate profit for the temp policy using firstAddon's data (not main policy data)
const tempProfitData = await calculatePolicyProfit({
  policyTypeParent: tempPolicyTypeParent,  // the addon type (e.g., THIRD_FULL)
  policyTypeChild: tempPolicyTypeChild,
  companyId: firstAddon?.company_id || policy.company_id,
  ...
  insurancePrice: firstAddonPrice,
  brokerBuyPrice: firstAddon?.broker_buy_price ? parseFloat(firstAddon.broker_buy_price) : null,
});

.update({ 
  insurance_price: firstAddonPrice,  // 1,500 (THIRD price, not ELZAMI price)
  profit: tempProfitData.profit,
  payed_for_company: tempProfitData.companyPayment,
  ...
})
```

The key changes in the Visa package flow (lines ~938-1087):
1. Move `firstAddon` detection (currently at line 976-981) BEFORE the temp policy update (line 960)
2. Use `firstAddon.insurance_price` for the temp policy update instead of `policy.insurance_price`
3. Recalculate profit using the addon's type/company/price, not the main policy's
4. The main policy (ELZAMI) creation at line 1050-1087 remains unchanged -- it already correctly uses `mainInsurancePrice`

### Data Fix for كارين ازرق
After deploying the code fix, the existing incorrect THIRD policy needs a manual correction. The THIRD policy (id: `e7f1e220-2186-4a5a-b2f7-547001ee465f`) should have `insurance_price = 1500` and recalculated profit/company_payment.

This will be done via a one-time SQL update after the code fix is applied.
