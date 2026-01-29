
# خطة إصلاح مشاكل التحديث الفوري وحساب المتبقي وعرض الوثائق الجديدة

## المشاكل المكتشفة

### 1. عدم تحديث البيانات فوراً بعد تعديل الدفعات أو إضافة وثيقة
**السبب**: عند إضافة دفعة أو تعديلها، يتم استدعاء `fetchPaymentSummary()` و `fetchPayments()` فقط، بدون `fetchPolicies()` أو تحديث بيانات الدفع في `PolicyYearTimeline`.

**الملفات المتأثرة**:
- `ClientDetails.tsx` - يحتاج لتمرير callback أشمل
- `PolicyYearTimeline.tsx` - يحتاج لاستقبال إشارة التحديث

### 2. المتبقي يُظهر ₪800 بدلاً من ₪1,800
**تحليل البيانات**:
- سعر الباقة الكامل = ₪2,800
- `debtPrice` (بدون إلزامي) = ₪1,800
- المدفوع (على الإلزامي) = ₪1,000
- الحساب الحالي: `1,800 - 1,000 = 800` ← **خطأ!**

**السبب**: المنطق يستخدم `debtPrice` (الذي يستثني الإلزامي) لكنه يحسب كل الدفعات (بما فيها الإلزامي). هذا يعني أن دفعة الإلزامي تُخصم من دين غير الإلزامي.

**الحل الصحيح**: حساب المتبقي لكل وثيقة على حدة ثم جمعها، أو استخدام `totalPrice` بدلاً من `debtPrice`.

### 3. الوثائق الجديدة يجب أن تظهر أولاً
**السبب**: الترتيب الحالي يعتمد على حالة الوثيقة (active → ended → etc) ثم تاريخ البدء، بدون اعتبار لـ `created_at`.

### 4. شارة "جديدة" يجب أن تظهر من الخارج على البطاقة
**الوضع الحالي**: الشارة موجودة بالفعل (السطور 755-761)، لكن قد لا يتم جلب `created_at` مع البيانات أو لا يتم تمريرها بشكل صحيح.

---

## التغييرات المطلوبة

### الملف 1: `src/components/clients/ClientDetails.tsx`

| التغيير | التفاصيل |
|---------|----------|
| تحديث شامل | إضافة `fetchPolicies()` إلى callback الدفع |
| جلب created_at | التأكد من جلب `created_at` في استعلام الوثائق |

**تعديل fetchPolicies (السطر 271-295)**:
```typescript
const { data, error } = await supabase
  .from('policies')
  .select(`
    id, policy_number, policy_type_parent, policy_type_child, 
    start_date, end_date, insurance_price, profit, 
    cancelled, transferred, group_id,
    transferred_car_number, transferred_to_car_number, 
    transferred_from_policy_id,
    created_at, branch_id,  // ← إضافة created_at و branch_id
    company:insurance_companies(name, name_ar),
    car:cars(id, car_number),
    creator:profiles!policies_created_by_admin_id_fkey(full_name, email)
  `)
```

**تعديل PolicyYearTimeline onPaymentAdded (السطر 1138-1144)**:
```typescript
<PolicyYearTimeline 
  policies={filteredPolicies} 
  onPolicyClick={handlePolicyClick}
  onPaymentAdded={() => {
    fetchPaymentSummary();
    fetchPayments();
    fetchPolicies();  // ← إضافة
    fetchWalletBalance();  // ← إضافة
  }}
  // ... باقي الـ props
/>
```

### الملف 2: `src/components/clients/PolicyYearTimeline.tsx`

| التغيير | التفاصيل |
|---------|----------|
| إصلاح حساب المتبقي | استخدام `totalPrice` بدلاً من `debtPrice` |
| ترتيب الأحدث أولاً | إضافة `created_at` إلى معايير الترتيب |
| تمرير branch_id | التأكد من تمرير branch_id للـ PaymentModal |

**تعديل getPackagePaymentStatus (السطور 493-504)**:
```typescript
const getPackagePaymentStatus = (pkg: PolicyPackage) => {
  // حساب المتبقي لكل وثيقة على حدة ثم الجمع
  let totalRemaining = 0;
  let totalPaid = 0;
  
  pkg.allPolicyIds.forEach(id => {
    const policyPaid = paymentInfo[id]?.paid || 0;
    const policyRemaining = paymentInfo[id]?.remaining || 0;
    totalPaid += policyPaid;
    totalRemaining += Math.max(0, policyRemaining);
  });
  
  const isPaid = totalRemaining <= 0 && pkg.totalPrice > 0;
  return { totalPaid, remaining: totalRemaining, isPaid };
};
```

**تعديل ترتيب الباقات (السطور 356-365)**:
```typescript
// Sort packages within year: 
// 1. Newly created (last 24h) first
// 2. Then by status: active → ended → transferred → cancelled
// 3. Then by newest start date
packages.sort((a, b) => {
  const policyA = a.mainPolicy || a.addons[0];
  const policyB = b.mainPolicy || b.addons[0];
  
  // New policies first (created within last 24 hours)
  const aIsNew = policyA?.created_at && isNewPolicy(policyA.created_at);
  const bIsNew = policyB?.created_at && isNewPolicy(policyB.created_at);
  if (aIsNew && !bIsNew) return -1;
  if (!aIsNew && bIsNew) return 1;
  
  // Then by status priority
  const priorityA = getStatusPriority(a.status);
  const priorityB = getStatusPriority(b.status);
  if (priorityA !== priorityB) return priorityA - priorityB;
  
  // Then by newest start date
  const dateA = policyA?.start_date || '';
  const dateB = policyB?.start_date || '';
  return new Date(dateB).getTime() - new Date(dateA).getTime();
});
```

### الملف 3: `src/components/clients/PolicyRecord interface`

**تعديل interface في PolicyYearTimeline (السطور 39-59)**:
```typescript
interface PolicyRecord {
  // ... الحقول الموجودة
  branch_id?: string | null;
  created_at?: string;  // التأكد من وجود هذا الحقل
}
```

---

## ملخص الملفات المتأثرة

| الملف | التغييرات |
|-------|----------|
| `ClientDetails.tsx` | 1. إضافة `created_at, branch_id` للاستعلام 2. تحديث callback ليشمل كل البيانات |
| `PolicyYearTimeline.tsx` | 1. إصلاح حساب المتبقي 2. ترتيب الوثائق الجديدة أولاً 3. التأكد من تمرير branch_id |

---

## النتائج المتوقعة

1. ✅ تحديث فوري للبيانات بعد إضافة/تعديل الدفعات أو الوثائق
2. ✅ المتبقي يُظهر ₪1,800 (الحساب الصحيح لكل وثيقة على حدة)
3. ✅ الوثائق الجديدة (آخر 24 ساعة) تظهر أولاً في القائمة
4. ✅ شارة "جديدة" تظهر بوضوح على البطاقة من الخارج
