
# خطة إصلاح عرض الباقة الموحدة

## المشاكل المكتشفة

### 1. جدول مكونات الباقة لا يُظهر خدمات الطريق ورسوم الحادث
**السبب**: عند فتح الـ Drawer، البيانات موجودة في قاعدة البيانات (تم التحقق):
- إلزامي: ₪1,000
- ثالث/شامل: ₪1,000  
- خدمات الطريق (زجاج): ₪200
- إعفاء رسوم حادث: ₪300

**التحليل**: الاستعلام صحيح ويجلب كل الوثائق ذات `group_id` نفسه. المشكلة في طريقة عرض البيانات في `PackageComponentsTable`.

### 2. عداد الملفات يُظهر 0 رغم وجود ملف
**السبب**: 
- الملف المرفوع مرتبط بـ `entity_id` لباقة **أخرى** (group_id مختلف)
- الباقة الحالية فعلاً لا تحتوي على ملفات

**الحل**: هذا ليس خطأ - الباقة الحالية لم يُرفع لها ملفات بعد

### 3. عداد الملفات لا يتحدث بعد الرفع
**السبب**: `useEffect` في `PolicyFilesSection` يعتمد فقط على `policyId` وليس `packagePolicyIds`

### 4. شارة "جديدة" للوثائق
**الطلب**: إضافة badge "جديدة" للوثائق المنشأة حديثاً

---

## التغييرات المطلوبة

### 1. إصلاح جدول مكونات الباقة (PackageComponentsTable)

| الملف | التغيير |
|-------|---------|
| `PolicyDetailsDrawer.tsx` | التأكد من تمرير كل الوثائق المرتبطة بما فيها road_services و accident_fee_services |

**المشكلة المحددة**: عند البناء، الوثيقة الرئيسية (policy) قد لا تحتوي على `accident_fee_services` في هيكل البيانات لأن الاستعلام الأصلي لا يجلبها.

**الحل**: تعديل استعلام الوثيقة الرئيسية ليشمل `accident_fee_services`:
```typescript
// الاستعلام الحالي
.select(`
  *,
  ...,
  road_services(id, name, name_ar)
`)

// الاستعلام المصحح
.select(`
  *,
  ...,
  road_services(id, name, name_ar),
  accident_fee_services(id, name, name_ar)
`)
```

### 2. إصلاح عداد الملفات بعد الرفع

| الملف | التغيير |
|-------|---------|
| `PolicyFilesSection.tsx` | إضافة `packagePolicyIds` إلى dependencies في useEffect |
| `PolicyDetailsDrawer.tsx` | إضافة callback لتحديث عداد الملفات |

**التغيير في PolicyFilesSection.tsx**:
```typescript
useEffect(() => {
  fetchFiles();
}, [policyId, packagePolicyIds]); // إضافة packagePolicyIds
```

### 3. إضافة شارة "جديدة" للوثائق

| الملف | التغيير |
|-------|---------|
| `PolicyYearTimeline.tsx` | إضافة badge "جديدة" للوثائق المنشأة خلال آخر 24 ساعة |

**المنطق**:
```typescript
const isNew = (createdAt: string) => {
  const created = new Date(createdAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
};
```

**العرض**: badge صغيرة "جديدة" بلون مميز (أخضر أو أزرق)

---

## ملخص الملفات المتأثرة

| الملف | التغييرات |
|-------|----------|
| `src/components/policies/PolicyDetailsDrawer.tsx` | 1. إضافة `accident_fee_services` للاستعلام الرئيسي |
| `src/components/policies/PolicyFilesSection.tsx` | 1. إضافة `packagePolicyIds` إلى useEffect dependencies |
| `src/components/clients/PolicyYearTimeline.tsx` | 1. إضافة badge "جديدة" للوثائق الحديثة |

---

## ملاحظة حول رقم البوليصة
حقل "رقم البوليصة" مخصص فقط لوثائق ثالث/شامل - هذا سلوك صحيح ومقصود لأن شركات التأمين تصدر رقم بوليصة فقط لهذا النوع.
