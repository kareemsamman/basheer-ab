

# إصلاح "وثائق تنتهي قريباً" - استثناء الوثائق المُجددة

## المشكلة
الوثائق التي تم تجديدها (تم إنشاء وثيقة جديدة للعميل) لا تزال تظهر في قسم "وثائق تنتهي قريباً" على الـ Dashboard.

## السبب
الكود الحالي في `ExpiringPolicies.tsx` يجلب كل الوثائق المنتهية ويعرض حالة التجديد كـ Badge، لكنه **لا يستبعد** الوثائق التي حالتها `renewed`.

## الحل

### تعديل Query في الـ Frontend

بما أن Supabase JS لا يدعم فلترة متقدمة على الـ JOIN بسهولة، نحتاج إما:
1. **فلترة في الـ Frontend** بعد جلب البيانات (سهل وسريع)
2. **إنشاء RPC function** (أكثر تعقيداً)

**الحل المختار:** فلترة Frontend (الأبسط والأسرع)

### الملف: `src/components/dashboard/ExpiringPolicies.tsx`

```tsx
// في سطر 69 بعد جلب البيانات
if (error) throw error;

// فلترة الوثائق المُجددة قبل عرضها
const filteredPolicies = (data || []).filter(policy => {
  const renewalStatus = policy.renewal_tracking?.[0]?.renewal_status;
  // استبعاد الوثائق التي تم تجديدها
  return renewalStatus !== 'renewed';
});

setPolicies(filteredPolicies);
```

---

## التفاصيل التقنية

### قبل التغيير:
```tsx
if (error) throw error;
setPolicies(data || []);  // يعرض كل الوثائق بما فيها المُجددة
```

### بعد التغيير:
```tsx
if (error) throw error;

// استبعاد الوثائق المُجددة من القائمة
const filteredPolicies = (data || []).filter(policy => {
  const renewalStatus = policy.renewal_tracking?.[0]?.renewal_status;
  return renewalStatus !== 'renewed';
});

setPolicies(filteredPolicies);
```

---

## النتيجة المتوقعة

| حالة التجديد | يظهر في Dashboard؟ |
|--------------|---------------------|
| `null` (جديد) | ✅ نعم |
| `sms_sent` | ✅ نعم |
| `called` | ✅ نعم |
| `not_interested` | ✅ نعم |
| **`renewed`** | ❌ **لا** |

---

## ملاحظة عن الـ Badge

سيتم الإبقاء على عرض Badge للحالات الأخرى (`sms_sent`, `called`, `not_interested`) لأنها معلومات مفيدة للمستخدم لمعرفة حالة متابعة الوثيقة.

