
# خطة: إصلاح زر تعديل الباقة الرئيسي

## المشكلة
عند الضغط على زر "تعديل" في header الوثيقة (الموجود بجانب أزرار تحويل وإلغاء)، يفتح الـ drawer القديم `PolicyEditDrawer` الذي يعرض وثيقة واحدة فقط، بدلاً من فتح الـ modal الجديد `PackagePolicyEditModal` الذي يعرض كل وثائق الباقة.

**الحالة الحالية:**
- زر "تعديل" في Header يستدعي `setEditOpen(true)` → يفتح `PolicyEditDrawer` (القديم)
- زر تعديل في جدول مكونات الباقة يستدعي `setPackageEditGroupId(...)` → يفتح `PackagePolicyEditModal` (الجديد)

**المطلوب:**
- زر "تعديل" في Header للباقات يجب أن يفتح `PackagePolicyEditModal` (الجديد)
- زر "تعديل" في Header للوثائق المنفردة يبقى يفتح `PolicyEditDrawer` (القديم)

## الحل

### التغيير في PolicyDetailsDrawer.tsx

**1. تعديل onClick لزر "تعديل" في Header (سطر ~790)**

```tsx
// قبل
onClick={() => setEditOpen(true)}

// بعد
onClick={() => {
  if (hasPackage && policy.group_id) {
    setPackageEditGroupId(policy.group_id);
  } else {
    setEditOpen(true);
  }
}}
```

**المنطق:**
- إذا كانت الوثيقة جزء من باقة (`hasPackage = true`) ولها `group_id`
  → افتح `PackagePolicyEditModal` عبر `setPackageEditGroupId(policy.group_id)`
- إذا كانت وثيقة منفردة
  → افتح `PolicyEditDrawer` عبر `setEditOpen(true)`

## ملخص التغييرات

| الملف | السطر | التغيير |
|-------|-------|---------|
| `PolicyDetailsDrawer.tsx` | ~790 | تعديل onClick لزر "تعديل" ليفتح الـ modal المناسب حسب نوع الوثيقة |

## النتيجة المتوقعة
- للباقات: الضغط على "تعديل" يفتح نافذة كبيرة تعرض كل وثائق الباقة مع إمكانية تعديل التواريخ والسعر لكل واحدة
- للوثائق المنفردة: الضغط على "تعديل" يفتح الـ drawer القديم كما كان
