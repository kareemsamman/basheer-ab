
# خطة: إصلاح مشاكل فاتورة الباقة على CDN

## ملخص المشاكل المُكتشفة

| # | المشكلة | السبب |
|---|---------|-------|
| 1 | منورا تظهر "ثالث/شامل" بدلاً من "إلزامي" | عند دفع الفيزا، يتم إنشاء الوثيقة المؤقتة بنوع الفئة (THIRD_FULL) بدلاً من نوع الوثيقة الفعلي (ELZAMI) |
| 2 | اراضي مقدسة تظهر "ثالث/شامل" بدلاً من "ثالث" | دالة buildPackageInvoiceHtml تستخدم `policy_type_parent` فقط وتتجاهل `policy_type_child` |
| 3 | دفعة الفيزا (1₪) لا تظهر في سجل الدفعات | الاستعلام يُفلتر بـ `.eq('refused', false)` لكن دفعة الفيزا لها `refused: null` (قيد الانتظار) |
| 4 | عمود "الوثيقة" يظهر في جدول الدفعات للباقة | للباقات، الدفعات تغطي الباقة كلها فلا حاجة لإظهار الوثيقة لكل دفعة |
| 5 | نوع الخدمة لا يظهر للـ ROAD_SERVICE | يجب إظهار اسم خدمة الطريق المحددة |

---

## الإصلاح 1: تصحيح نوع الوثيقة في handleCreateTempPolicy

**الملف:** `src/components/policies/PolicyWizard.tsx`

**المشكلة:** عند إنشاء الوثيقة المؤقتة للباقة، يتم استخدام نوع الفئة (THIRD_FULL) بدلاً من نوع الوثيقة الرئيسية الفعلي.

في الباقة:
- الوثيقة الرئيسية من منورا هي **ELZAMI** (إلزامي)
- اراضي مقدسة هي **THIRD** (ثالث)
- الخدمة هي **ROAD_SERVICE**

**الحل:** تحديث handleCreateTempPolicy للتعامل مع الباقات:

```typescript
// عند إنشاء وثيقة مؤقتة للباقة، استخدم نوع الإضافة الأولى المفعلة
// لأن الوثيقة الرئيسية في الباقة هي عادةً ELZAMI

if (packageMode && packageAddons.some(a => a.enabled)) {
  // الوثيقة المؤقتة يجب أن تكون للمكون الأول (عادةً ELZAMI)
  const firstAddon = packageAddons.find(a => a.type === 'ELZAMI' && a.enabled);
  if (firstAddon) {
    policyTypeParent = 'ELZAMI';
    companyId = firstAddon.company_id;
    insurancePrice = firstAddon.insurance_price;
  }
}
```

---

## الإصلاح 2: عرض policy_type_child بشكل صحيح

**الملف:** `supabase/functions/send-package-invoice-sms/index.ts`

**التغيير:** تحديث دالة عرض نوع التأمين لاستخدام policy_type_child عند توفره:

```typescript
// الكود الحالي (سطر 490):
const policyType = POLICY_TYPE_LABELS[p.policy_type_parent] || p.policy_type_parent;

// الكود الجديد:
let policyType = '';
if (p.policy_type_child && POLICY_TYPE_LABELS[p.policy_type_child]) {
  // استخدم النوع الفرعي إذا وُجد (ثالث أو شامل)
  policyType = POLICY_TYPE_LABELS[p.policy_type_child];
} else {
  policyType = POLICY_TYPE_LABELS[p.policy_type_parent] || p.policy_type_parent;
}
```

---

## الإصلاح 3: إظهار دفعات الفيزا (refused = null)

**الملف:** `supabase/functions/send-package-invoice-sms/index.ts`

**التغيير:** تعديل استعلام الدفعات ليشمل `refused IS NULL` (للفيزا قيد المعالجة) و `refused = false` (للدفعات المقبولة):

```typescript
// الكود الحالي (سطر 187):
.eq('refused', false)

// الكود الجديد:
.or('refused.eq.false,refused.is.null')
```

---

## الإصلاح 4: إخفاء عمود "الوثيقة" في جدول دفعات الباقات

**الملف:** `supabase/functions/send-package-invoice-sms/index.ts`

**التغيير:** بما أن الدفعات للباقة كلها، لا حاجة لإظهار عمود الوثيقة:

```html
<!-- الجدول الحالي -->
<table>
  <tr>
    <th>الوثيقة</th>  <!-- حذف هذا العمود -->
    <th>التاريخ</th>
    <th>طريقة الدفع</th>
    <th>المبلغ</th>
  </tr>
</table>

<!-- الجدول الجديد -->
<table>
  <tr>
    <th>التاريخ</th>
    <th>طريقة الدفع</th>
    <th>المبلغ</th>
  </tr>
</table>
```

**ملاحظة:** يجب أيضاً دمج الدفعات من جميع الوثائق بدلاً من تكرارها مع اسم الوثيقة.

---

## الإصلاح 5: إظهار نوع الخدمة للـ ROAD_SERVICE

**الملف:** `supabase/functions/send-package-invoice-sms/index.ts`

**التغيير:** جلب بيانات خدمة الطريق وعرض اسمها:

```typescript
// إضافة JOIN لجلب اسم خدمة الطريق
const { data: policies } = await supabase
  .from("policies")
  .select(`
    *,
    road_service:road_services(name),
    ...
  `)

// وفي عرض نوع التأمين:
if (p.policy_type_parent === 'ROAD_SERVICE' && p.road_service?.name) {
  policyType = `خدمات الطريق - ${p.road_service.name}`;
}
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/policies/PolicyWizard.tsx` | إصلاح نوع الوثيقة المؤقتة للباقات |
| `supabase/functions/send-package-invoice-sms/index.ts` | إصلاحات عرض نوع التأمين، الدفعات، والخدمات |

---

## النتيجة المتوقعة

1. ✅ منورا ستظهر "إلزامي" بدلاً من "ثالث/شامل"
2. ✅ اراضي مقدسة ستظهر "ثالث" بدلاً من "ثالث/شامل"
3. ✅ دفعة الفيزا (1₪) ستظهر في سجل الدفعات كـ "فيزا"
4. ✅ جدول الدفعات لن يحتوي عمود "الوثيقة" للباقات
5. ✅ خدمات الطريق ستظهر مع اسم الخدمة

---

## ملاحظة بخصوص الوثائق الحالية

الوثائق المُنشأة سابقاً (مثل باقة "Kareem Test") بها مشكلة في البيانات:
- منورا مسجلة كـ THIRD_FULL بدلاً من ELZAMI

**خياران للإصلاح:**
1. **إصلاح يدوي**: تحديث `policy_type_parent` للوثيقة الخاطئة في قاعدة البيانات
2. **إعادة إنشاء**: حذف الباقة الخاطئة وإنشاء واحدة جديدة

هل ترغب أن أقوم بإصلاح البيانات الحالية أيضاً؟
