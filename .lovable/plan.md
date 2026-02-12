
# Fix: عرض "شامل" او "ثالث" بدل "ثالث/شامل" في كل مكان

## المشكلة
عند إنشاء وثيقة من نوع THIRD_FULL مع child type (مثلا FULL = شامل)، يعرض النظام "ثالث/شامل" في كل مكان بدل عرض "شامل" فقط. السبب هو أن أغلب المكونات تستخدم `policyTypeLabels[policy.policy_type_parent]` مباشرة بدون فحص الـ child type.

## الحل

### 1. إنشاء دالة مركزية واحدة
توجد بالفعل دالة `getInsuranceTypeLabel` في `src/lib/insuranceTypes.ts` تعمل بشكل صحيح، لكن لا يستخدمها أحد تقريبا. سيتم تحديث كل المكونات لاستخدامها.

### 2. المكونات المطلوب تعديلها (Frontend - 13 ملف)

| ملف | المشكلة |
|------|---------|
| `src/components/clients/ClientDetails.tsx` | عدة أماكن تستخدم `policyTypeLabels[type]` بدون child check |
| `src/components/clients/PackagePaymentModal.tsx` | يعرض `policyTypeLabels[policy.policyType]` |
| `src/components/clients/ClientReportModal.tsx` | عدة أماكن |
| `src/components/clients/PaymentEditDialog.tsx` | يعرض `policyTypeLabels[payment.policy.policy_type_parent]` |
| `src/components/clients/PolicyYearTimeline.tsx` | `getTypeLabel()` لا يستخدم child types |
| `src/components/policies/PolicyDetailsDrawer.tsx` | dictionary محلي بدون child check |
| `src/components/policies/PackageComponentsTable.tsx` | dictionary محلي بدون child check |
| `src/components/policies/PackagePolicyEditModal.tsx` | dictionary محلي بدون child check |
| `src/components/policies/PolicyEditDrawer.tsx` | label ثابت |
| `src/components/dashboard/ExpiringPolicies.tsx` | dictionary محلي بدون child check |
| `src/components/brokers/BrokerDetails.tsx` | dictionary محلي |
| `src/components/debt/DebtPaymentModal.tsx` | dictionary محلي |
| `src/components/accident-reports/PolicySelectionCards.tsx` | dictionary محلي |

### 3. Edge Functions (4 ملفات)

| ملف | تغيير |
|------|--------|
| `supabase/functions/generate-broker-report/index.ts` | استخدام child label |
| `supabase/functions/generate-client-payments-invoice/index.ts` | استخدام child label |
| `supabase/functions/send-invoice-sms/index.ts` | استخدام child label |
| `supabase/functions/cron-renewal-reminders/index.ts` | استخدام child label |

### التغيير التقني

في كل مكان يعرض نوع الوثيقة، بدل:
```text
policyTypeLabels[policy.policy_type_parent]
// النتيجة: "ثالث/شامل"
```

سيصبح:
```text
// إذا كان THIRD_FULL مع child type → عرض child label فقط
// وإلا → عرض parent label
getDisplayLabel(policy.policy_type_parent, policy.policy_type_child)
// النتيجة: "شامل" او "ثالث"
```

### ملاحظة مهمة
الأماكن التالية يجب أن تبقى "ثالث/شامل" لأنها تعرض **فئة** وليس وثيقة محددة:
- فلاتر البحث (PolicyFilters)
- نموذج إنشاء وثيقة (PolicyDrawer/Wizard) 
- إعدادات الشركات (CompanyDrawer)
- قائمة أنواع التأمين (Companies page)

هذه أماكن يختار فيها المستخدم الفئة العامة قبل تحديد النوع الفرعي.
