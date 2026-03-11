

# Fix: Save addon car_value to cars table

## Problem
When a user enters a car value in the package addon's "قيمة السيارة" field (for FULL/شامل insurance), the value is used for profit calculation but never persisted to the `cars` table. The existing update logic only checks `newCar.car_value` or `policy.full_car_value`, missing the addon-level `car_value`.

## Fix
In `src/components/policies/PolicyWizard.tsx`, after processing package addons (in both Visa and non-Visa flows), add logic to update the car's `car_value` if a THIRD_FULL addon with child type FULL has a `car_value` set:

```typescript
// After addon policies are saved, update car_value from FULL addon
const fullAddon = packageAddons.find(a => a.type === 'third_full' && a.enabled && a.policy_type_child === 'FULL' && a.car_value);
if (fullAddon && carId) {
  await supabase.from('cars').update({ car_value: parseFloat(fullAddon.car_value!) }).eq('id', carId);
}
```

This needs to be added in **two places**:
1. After the non-Visa addon save loop (~line 906)
2. After the Visa addon save section (end of that block)

This ensures the car record reflects the value the user entered/confirmed during policy creation.

