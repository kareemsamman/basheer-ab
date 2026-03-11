

# Add Car Value Input for شامل (FULL) Package Addon

## Problem
When the main policy is ELZAMI and the user adds a THIRD_FULL addon with child type "شامل" (FULL), the system needs the car value to calculate the company payment (FULL uses percentage-based pricing). Currently there's no car value input in the addon card, and no validation blocks proceeding to payments.

## Changes

### 1. Add `car_value` field to `PackageAddon` type
**File:** `src/components/policies/wizard/types.ts`
- Add `car_value?: string` to the `PackageAddon` interface

### 2. Add car value input + fetch button in the THIRD_FULL addon card
**File:** `src/components/policies/wizard/PackageBuilderSection.tsx`
- Pass `selectedCar` (car number, manufacturer, model, year) as a new prop
- When THIRD_FULL addon child is "FULL", show a "قيمة السيارة (₪)" input field
- Add a "جلب السعر" (Fetch Price) button next to it that calls the `fetch-car-price` edge function using the selected car's details (manufacturer, model, year)
- Pre-fill from `selectedCar.car_value` if available when the addon is enabled
- Allow manual override of the value

### 3. Add validation for addon car value
**File:** `src/components/policies/wizard/usePolicyWizardState.ts`
- In the `validateStep` for "policy" step, when `thirdFullAddon` is enabled and `policy_type_child === 'FULL'`, require `car_value > 0` (check addon's `car_value` first, then fall back to `selectedCar.car_value`)
- Error key: `addon_thirdfull_car_value`

### 4. Pass car value through to profit calculation on save
**File:** `src/components/policies/PolicyWizard.tsx`
- When saving the THIRD_FULL addon, use `thirdFullAddon.car_value` for the `carValue` param in `calculatePolicyProfit` and also update the car record's `car_value` if it was fetched/entered

### 5. Pass `selectedCar` prop to `PackageBuilderSection`
**File:** `src/components/policies/wizard/Step3PolicyDetails.tsx`
- Thread `selectedCar` through to `PackageBuilderSection`

