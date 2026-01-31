
# خطة: توحيد جميع حقول التاريخ لاستخدام ArabicDatePicker

## المشكلة
بعض الصفحات والمكونات تستخدم `<Input type="date" />` الأصلي (الصورة الأولى - نمط LTR إنجليزي) بينما يجب استخدام `ArabicDatePicker` الموحد (الصورة الثانية - نمط RTL عربي مع أشهر عربية).

---

## الملفات المطلوب تعديلها (15 ملف)

### مجموعة 1: صفحات التقارير والفلاتر
| الملف | الحقول |
|-------|--------|
| `src/pages/PolicyReports.tsx` | createdFromDate, createdToDate |
| `src/pages/ElzamiCostsReport.tsx` | fromDate, toDate |
| `src/pages/CompanySettlementDetail.tsx` | startDate, endDate |
| `src/pages/Expenses.tsx` | formData.expense_date |
| `src/components/admin/UserSessionsTab.tsx` | startDate, endDate |

### مجموعة 2: مكونات الدفعات
| الملف | الحقول |
|-------|--------|
| `src/components/clients/PackagePaymentModal.tsx` | payment.paymentDate |
| `src/components/clients/SinglePolicyPaymentModal.tsx` | payment.paymentDate |
| `src/components/debt/DebtPaymentModal.tsx` | payment.paymentDate |
| `src/components/policies/PolicyPaymentsSection.tsx` | payment.paymentDate |

### مجموعة 3: مكونات البوليصات والسيارات
| الملف | الحقول |
|-------|--------|
| `src/components/policies/PolicyDrawer.tsx` | start_date, end_date |
| `src/components/cars/CarDrawer.tsx` | license_expiry, last_license |

### مجموعة 4: مكونات المطالبات والعملاء
| الملف | الحقول |
|-------|--------|
| `src/components/claims/RepairClaimDrawer.tsx` | accident_date |
| `src/components/clients/RefundsTab.tsx` | refundDate |
| `src/pages/RepairClaimDetail.tsx` | reminderDate |

### مجموعة 5: نموذج تقرير الحادث
| الملف | الحقول |
|-------|--------|
| `src/pages/AccidentReportForm.tsx` | accidentDate, licenseExpiryDate, firstLicenseDate, vehicleLicenseExpiry |

---

## التفاصيل التقنية

### نمط التعديل الموحد

**قبل (Input type="date"):**
```tsx
<Input
  type="date"
  value={dateValue}
  onChange={(e) => setDateValue(e.target.value)}
/>
```

**بعد (ArabicDatePicker):**
```tsx
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";

<ArabicDatePicker
  value={dateValue}
  onChange={(date) => setDateValue(date)}
/>
```

### حالات خاصة

1. **حقول تاريخ الميلاد** - إضافة `isBirthDate` لتوسيع نطاق السنوات:
```tsx
<ArabicDatePicker
  value={birthDate}
  onChange={setBirthDate}
  isBirthDate
/>
```

2. **حقول مضغوطة (داخل جداول/قوائم)** - إضافة `compact`:
```tsx
<ArabicDatePicker
  value={payment.paymentDate}
  onChange={(date) => updatePaymentLine(payment.id, 'paymentDate', date)}
  compact
/>
```

3. **حقول مع حدود (min/max)**:
```tsx
<ArabicDatePicker
  value={endDate}
  onChange={setEndDate}
  min={startDate}
/>
```

4. **حقول معطلة (disabled)**:
```tsx
<ArabicDatePicker
  value={payment.paymentDate}
  onChange={(date) => updatePaymentLine(payment.id, 'paymentDate', date)}
  disabled={payment.tranzilaPaid}
/>
```

---

## تفاصيل كل ملف

### 1. src/pages/PolicyReports.tsx (سطور 675-688)
- إضافة import للـ ArabicDatePicker
- تغيير حقلي `createdFromDate` و `createdToDate`

### 2. src/pages/ElzamiCostsReport.tsx (سطور 142-156)
- إضافة import
- تغيير حقلي `fromDate` و `toDate`

### 3. src/pages/CompanySettlementDetail.tsx (سطور 458-479)
- إضافة import
- تغيير حقلي `startDate` و `endDate`

### 4. src/pages/Expenses.tsx (سطور 407-411)
- إضافة import
- تغيير حقل `formData.expense_date`

### 5. src/components/admin/UserSessionsTab.tsx (سطور 174-186)
- إضافة import
- تغيير حقلي `startDate` و `endDate`

### 6. src/components/clients/PackagePaymentModal.tsx (سطور 599-604)
- إضافة import
- تغيير حقل `payment.paymentDate` مع `compact`

### 7. src/components/clients/SinglePolicyPaymentModal.tsx (سطور 530-535)
- إضافة import
- تغيير حقل `payment.paymentDate` مع `compact`

### 8. src/components/debt/DebtPaymentModal.tsx (سطور 845-850)
- إضافة import
- تغيير حقل `payment.paymentDate` مع `compact`

### 9. src/components/policies/PolicyPaymentsSection.tsx (سطور 961-966)
- إضافة import
- تغيير حقل `payment.paymentDate` مع `compact`

### 10. src/components/policies/PolicyDrawer.tsx (سطور 369-387)
- إضافة import
- تغيير حقلي `start_date` و `end_date`
- ملاحظة: يستخدم react-hook-form، سيتم التكامل عبر `field.value` و `field.onChange`

### 11. src/components/cars/CarDrawer.tsx (سطور 484-498)
- إضافة import
- تغيير حقلي `license_expiry` و `last_license`
- ملاحظة: يستخدم react-hook-form

### 12. src/components/claims/RepairClaimDrawer.tsx (سطور 403-405)
- إضافة import
- تغيير حقل `accident_date`
- ملاحظة: يستخدم react-hook-form

### 13. src/components/clients/RefundsTab.tsx (سطور 365-370)
- إضافة import
- تغيير حقل `refundDate`

### 14. src/pages/RepairClaimDetail.tsx (سطور 579-584)
- إضافة import
- تغيير حقل `reminderDate`

### 15. src/pages/AccidentReportForm.tsx (4 حقول)
- إضافة import
- تغيير الحقول:
  - `accidentDate` (سطر 695)
  - `licenseExpiryDate` (سطر 913)
  - `firstLicenseDate` (سطر 921)
  - `vehicleLicenseExpiry` (سطر 929)

---

## ملخص التنفيذ

| الخطوة | الوصف |
|--------|-------|
| 1 | إضافة import للـ ArabicDatePicker في كل ملف |
| 2 | استبدال كل `<Input type="date" />` بـ `<ArabicDatePicker />` |
| 3 | ضبط الخصائص حسب الحاجة (compact, disabled, isBirthDate, min, max) |
| 4 | للملفات التي تستخدم react-hook-form: استخدام `field.value` و `field.onChange` |

---

## النتيجة المتوقعة

- جميع حقول التاريخ ستعرض بالشكل العربي الموحد
- أسماء الأشهر بالعربية (يناير، فبراير، ...)
- أيام الأسبوع بالعربية (أحد، اثنين، ...)
- اتجاه RTL صحيح
- إمكانية الكتابة اليدوية بصيغة DD/MM/YYYY
- زر "اليوم" للاختيار السريع
