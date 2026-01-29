
# خطة إصلاح النشاط الأخير ووثائق تنتهي قريباً وإضافة ملخص التجديدات

## المشاكل المحددة

### 1. النشاط الأخير يعرض دفعات الإلزامي (خطأ تجاري)
**المشكلة**: عند استلام دفعة من وثيقة إلزامي، يظهر إشعار "دفعة مستلمة ₪X من العميل" رغم أن هذا المبلغ يذهب مباشرة لشركة التأمين وليس للوكيل.

**الحل**: استبعاد دفعات وثائق الإلزامي من قسم "النشاط الأخير" في Dashboard.

### 2. ودجت "وثائق تنتهي قريباً" لا تتطابق مع صفحة التقارير
**المشكلة الحالية**: 
- الودجت تعرض 6 وثائق فقط بدون تفاصيل كافية
- عند الضغط على "عرض الكل" تذهب لـ `/debt-tracking` بدلاً من `/reports/policies`
- لا تعرض معلومات حالة التجديد (تم الاتصال، تم إرسال SMS، إلخ)

**الحل**: تحديث الودجت لتتطابق مع صفحة التجديدات وتوجيه "عرض الكل" إلى `/reports/policies`

### 3. صفحة تقارير الوثائق تفتقد ملخص إحصائي قبل الجدول
**المشكلة**: المستخدم يريد رؤية ملخص سريع للأرقام قبل الجدول:
- عدد التجديدات الإجمالي
- عدد الذين تم إرسال SMS لهم
- عدد الذين تم الاتصال بهم
- إلخ

**الحل**: الملخص الإحصائي موجود بالفعل (سطور 957-984)! لكنه يُعرض فقط عند وجود `renewalsSummary`. سنتحقق من أنه يظهر دائماً.

---

## التغييرات المطلوبة

### الجزء 1: استبعاد دفعات الإلزامي من النشاط الأخير

| الملف | التغيير |
|------|---------|
| `src/components/dashboard/RecentActivity.tsx` | تعديل query الدفعات لجلب `policy_type_parent` واستبعاد `ELZAMI` |

```typescript
// التعديل المطلوب - إضافة policy_type_parent للـ select
const { data: payments } = await supabase
  .from("policy_payments")
  .select("id, created_at, amount, policies(cancelled, policy_type_parent, clients(full_name, deleted_at))")
  .order("created_at", { ascending: false })
  .match(branchFilter)
  .limit(10);

// ثم في الـ loop:
for (const pay of payments) {
  // Skip ELZAMI payments - money goes to company, not agent
  if ((pay.policies as any)?.policy_type_parent === 'ELZAMI') continue;
  // ... rest of logic
}
```

### الجزء 2: تحديث ودجت "وثائق تنتهي قريباً"

| الملف | التغيير |
|------|---------|
| `src/components/dashboard/ExpiringPolicies.tsx` | 1. تغيير الرابط من `/debt-tracking` إلى `/reports/policies?tab=renewals`<br>2. إضافة جلب حالة التجديد لكل وثيقة<br>3. عرض badge الحالة (تم إرسال SMS، إلخ) |

**التفاصيل:**
```typescript
// إضافة للـ interface
interface ExpiringPolicy {
  // ... existing fields
  renewal_status: string | null;
}

// تحديث الـ query
const { data, error } = await supabase
  .from("policies")
  .select(`
    id, end_date, policy_type_parent, insurance_price,
    client:clients(full_name),
    car:cars(car_number),
    company:insurance_companies(name, name_ar),
    renewal_tracking:policy_renewal_tracking(renewal_status)
  `)
  // ... same filters

// تغيير زر "عرض الكل"
onClick={() => navigate("/reports/policies?tab=renewals")}

// عرض badge الحالة في كل بطاقة
{policy.renewal_tracking?.[0]?.renewal_status && (
  <Badge variant="outline" className={statusColor}>
    {statusLabel}
  </Badge>
)}
```

### الجزء 3: التأكد من ظهور ملخص الإحصائيات

الملخص موجود بالفعل في `PolicyReports.tsx` سطور 957-984، ويعرض:
- إجمالي المنتهية
- لم يتم التواصل  
- تم إرسال SMS
- تم الاتصال
- تم التجديد
- غير مهتم

**الفحص**: التأكد من أن `report_renewals_summary` database function تُرجع البيانات بشكل صحيح.

---

## ملخص الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `src/components/dashboard/RecentActivity.tsx` | تعديل (استبعاد دفعات ELZAMI) |
| `src/components/dashboard/ExpiringPolicies.tsx` | تعديل (رابط + حالة التجديد) |

## النتائج المتوقعة

- ✅ دفعات الإلزامي لا تظهر في "النشاط الأخير" (لأن المال يذهب للشركة)
- ✅ زر "عرض الكل" في ودجت الوثائق المنتهية يوجه لصفحة التقارير
- ✅ عرض حالة التجديد (تم إرسال SMS، تم الاتصال) في ودجت الوثائق المنتهية
- ✅ ملخص الإحصائيات يظهر في أعلى صفحة التجديدات (موجود مسبقاً)
