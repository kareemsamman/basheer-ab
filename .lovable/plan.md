
# إضافة تاريخ الإصدار في شاشة تعديل/عرض الوثيقة

## المشكلة
حقل "تاريخ الإصدار" (issue_date) موجود فقط في معالج إنشاء الوثيقة (Wizard) لكنه غير موجود في:
1. شاشة تعديل الوثيقة (PolicyEditDrawer) - لا يمكن تعديله
2. شاشة عرض تفاصيل الوثيقة (PolicyDetailsDrawer) - يظهر فقط إذا كان مختلفاً عن تاريخ البداية

## الحل

### 1. PolicyEditDrawer (تعديل الوثيقة)
- إضافة `issue_date` لحالة النموذج (formData)
- جلب `issue_date` من قاعدة البيانات عند فتح المحرر
- إضافة حقل ArabicDatePicker لتاريخ الإصدار بعد حقول التواريخ (يظهر فقط لنوع THIRD_FULL)
- حفظ `issue_date` عند الضغط على حفظ

### 2. PolicyDetailsDrawer (عرض التفاصيل)
- عرض تاريخ الإصدار دائماً لوثائق ثالث/شامل (وليس فقط عندما يختلف عن تاريخ البداية)
- إضافة `issue_date` لاستعلام جلب البيانات

## التفاصيل التقنية

### ملف `src/components/policies/PolicyEditDrawer.tsx`
- إضافة `issue_date` في `formData` state (سطر 112-129)
- جلب `issue_date` من DB مع `office_commission` (سطر 169-179)
- إضافة حقل UI بعد تواريخ البدء/الانتهاء (بعد سطر 475)، يظهر فقط عندما `policy_type_parent === 'THIRD_FULL'`
- إضافة `issue_date` في استعلام التحديث (سطر 286-306)

### ملف `src/components/policies/PolicyDetailsDrawer.tsx`
- إضافة `issue_date` في استعلام select
- إضافة `issue_date` في واجهة PolicyDetails
- عرض تاريخ الإصدار دائماً لوثائق THIRD_FULL (وليس فقط عند الاختلاف)
