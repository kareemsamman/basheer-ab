

# إصلاح: الوثائق لا تظهر في تقرير الشركة

## المشكلة
عند إنشاء باقة (package policy)، الوثيقة الرئيسية تحصل على `issue_date` بشكل صحيح، لكن الوثائق الإضافية (addons) مثل شامل وخدمات طريق يتم حفظها بدون `issue_date` (NULL). تقرير تسوية الشركة يفلتر حسب `issue_date`، فلا تظهر الوثائق التي `issue_date` فيها NULL.

## الحل

### 1. ملف `src/components/policies/PolicyWizard.tsx`
- إضافة `issue_date: policy.issue_date || policy.start_date` في insert الخاص بوثائق الـ addons (السطر ~861-881)
- نفس الشيء لقسم Visa package addons (السطر ~900+)
- هذا يضمن أن كل وثيقة جديدة تحصل على تاريخ إصدار

### 2. إصلاح البيانات الحالية (migration)
- تحديث الوثائق الموجودة التي `issue_date` فيها NULL لتأخذ قيمة `start_date`:
```text
UPDATE policies SET issue_date = start_date WHERE issue_date IS NULL AND deleted_at IS NULL;
```

هذا يضمن ظهور جميع الوثائق القديمة والجديدة في تقارير الشركة.

