
# إصلاح عرض "ثالث/شامل" - الملفات المتبقية

## الوضع الحالي
ملف `PolicyYearTimeline.tsx` (المعروض في الصورة) تم إصلاحه بالفعل ويستخدم `getDisplayLabel` الذي يفحص `policy_type_child`. الصورة قد تعرض حالة قديمة قبل تحديث البناء.

لكن توجد ملفات أخرى لم تُصلح بعد وتستخدم `policyTypeLabels[policy.policy_type_parent]` مباشرة بدون فحص child type.

## الملفات المطلوب إصلاحها

### 1. `src/pages/PolicyReports.tsx` (عدة أماكن)
- سطر 1063: عرض نوع الوثيقة في جدول الوثائق - يستخدم `policyTypeLabels[policy.policy_type_parent]`
- سطر 1555: عرض نوع الوثيقة في تفاصيل العميل - نفس المشكلة
- سطر 1056: عرض أنواع الباقة `package_types` - هذه أنواع parent فقط، تبقى كما هي
- أسطر 1453, 1748, 1762, 1804, 1825: عرض `client.policy_types` - هذه أنواع parent مجمعة، تبقى كما هي (لأن التجميع يكون على مستوى parent)

### 2. `src/pages/DebtTracking.tsx`
- تم إصلاحه بالفعل (يستخدم `getPolicyTypeLabel` مع فحص child)

### التغييرات التقنية

| ملف | سطر | قبل | بعد |
|------|------|------|------|
| `PolicyReports.tsx` | 1063 | `policyTypeLabels[policy.policy_type_parent]` | `getInsuranceTypeLabel(policy.policy_type_parent, policy.policy_type_child)` |
| `PolicyReports.tsx` | 1555 | `policyTypeLabels[policy.policy_type_parent]` | `getInsuranceTypeLabel(policy.policy_type_parent, policy.policy_type_child)` |

يجب إضافة import لـ `getInsuranceTypeLabel` من `@/lib/insuranceTypes` والتأكد أن الاستعلام يجلب `policy_type_child`.

### ملاحظة
بالنسبة لصفحة العميل (PolicyYearTimeline) - الكود مُصلح بالفعل. إذا استمرت المشكلة بعد تطبيق هذا التحديث، فقد يكون السبب تخزين مؤقت في المتصفح.
