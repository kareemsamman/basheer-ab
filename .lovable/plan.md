

## Plan: Add Issue Date, Car Value, and Full Inline Editing to تفاصيل الوثائق Table

### What Changes

The detail table in `/reports/company-settlement` needs:
1. **Two new columns**: تاريخ الإصدار (issue_date) and قيمة السيارة (car_value)
2. **All fields editable** except العميل (client name) and رقم السيارة (car number)

### Single File: `src/pages/CompanySettlement.tsx`

#### 1. Update `BrokerPolicyDetail` interface
Add `car_value: number | null` field.

#### 2. Update `fetchBrokerPolicies` query
Add `cars (car_number, car_value)` to the select (currently only fetches `car_number`). Map `car_value` into the result.

#### 3. Update `editValues` state
Expand from `{ insurance_price, payed_for_company, profit }` to include `start_date`, `end_date`, `issue_date`, `policy_type_parent`, `policy_type_child`, `company_id`, `car_value`.

#### 4. Update `handleStartEdit` 
Populate all new edit fields from the policy.

#### 5. Update `handleSaveEdit`
Save all editable fields to `policies` table. For `car_value`, update the `cars` table separately using the car linked to the policy.

#### 6. Update table header
Add columns: تاريخ الإصدار (after تاريخ النهاية), قيمة السيارة (after رقم السيارة). Update skeleton column count.

#### 7. Update table rows
- **تاريخ الإصدار**: Show `issue_date`, editable with `ArabicDatePicker` or simple input
- **قيمة السيارة**: Show `car_value`, editable with number input
- **نوع التأمين**: Editable with Select dropdown (policy_type_parent + policy_type_child)
- **الشركة**: Editable with Select dropdown (company list)
- **تاريخ البداية / النهاية**: Editable with date inputs
- **المحصل / للشركة / الربح**: Already editable (keep as-is)
- **العميل / رقم السيارة**: Read-only (no edit)

### Technical Details
- `car_value` lives on `cars` table, so `handleSaveEdit` needs a second update call to `cars` when car_value changes
- Company options already fetched via `filteredCompanies` state — reuse for the company dropdown
- Column count increases from 10 to 12

