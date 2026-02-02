
# خطة: إصلاح عرض الوثائق المُجددة وتحسين التنقل

## المشاكل المكتشفة

### المشكلة 1: محمد عبد عويسات يعرض 0 وثائق جديدة

**السبب الجذري:** منطق البحث عن الوثائق الجديدة خاطئ.

الدالة تبحث عن وثائق جديدة حيث:
```sql
start_date > earliest_end_date - interval '30 days'
```

لكن في حالة **محمد عبد عويسات**:
- الوثيقة القديمة (THIRD_FULL) تنتهي: **2026-02-17**
- الوثيقة الجديدة (THIRD_FULL) بدأت: **2025-02-18**

المنطق يبحث عن: `start_date > 2026-01-18`
لكن الوثيقة الجديدة بدأت في `2025-02-18` (قبل سنة!)

**الحل:** استخدام نفس منطق الكشف عن التجديد الموجود في trigger - البحث عن الوثيقة اللاحقة مباشرة بناءً على (client_id, car_id, policy_type_parent, start_date > old.start_date)

---

### المشكلة 2: "Not found" عند الضغط على زر الرجوع

**السبب:** استخدام `window.location.href` يتسبب في تحميل الصفحة بالكامل، مما قد يفقد حالة التوجيه.

**الحل:** 
1. إضافة زر "رجوع" واضح في صفحة الملف الشخصي للعميل
2. تغيير التنقل من `window.location.href` إلى `navigate()` من React Router
3. استخدام state للحفاظ على مسار الرجوع

---

## التغييرات المطلوبة

### 1. إصلاح دالة `report_renewed_clients`

```sql
-- تغيير منطق البحث عن الوثائق الجديدة
-- من: start_date > earliest_end_date - 30 days
-- إلى: استخدام EXISTS مثل trigger الموجود

WITH expiring_policies AS (
  SELECT
    p.id,
    p.client_id,
    p.car_id,
    p.policy_type_parent AS ptype,
    p.group_id,
    p.insurance_price,
    p.end_date,
    p.start_date
  FROM policies p
  WHERE p.end_date BETWEEN v_month_start AND v_month_end
    AND p.cancelled = false
    -- ... filters
    -- Only include policies that have a newer successor
    AND EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.car_id IS NOT DISTINCT FROM p.car_id
        AND newer.policy_type_parent = p.policy_type_parent
        AND newer.start_date > p.start_date  -- بدأت بعد القديمة
        AND newer.end_date > CURRENT_DATE    -- لا تزال سارية
    )
),
-- للحصول على الوثائق الجديدة، نستخدم نفس المنطق
renewal_policies AS (
  SELECT DISTINCT ON (ep.id)
    ep.id AS old_policy_id,
    np.id AS new_policy_id,
    np.policy_type_parent AS new_ptype,
    np.insurance_price AS new_price,
    np.start_date AS new_start
  FROM expiring_policies ep
  JOIN policies np ON 
    np.client_id = ep.client_id
    AND np.car_id IS NOT DISTINCT FROM ep.car_id
    AND np.policy_type_parent = ep.ptype
    AND np.start_date > ep.start_date
    AND np.end_date > CURRENT_DATE
    AND np.cancelled = false
  ORDER BY ep.id, np.start_date ASC
)
```

### 2. تحسين التنقل في PolicyReports.tsx

```typescript
// تغيير من:
onClick={() => window.location.href = `/clients?open=${client.client_id}`}

// إلى:
import { useNavigate } from "react-router-dom";

const navigate = useNavigate();

onClick={() => navigate(`/clients?open=${client.client_id}`, { 
  state: { from: '/reports/policies', tab: 'renewed' }
})}
```

### 3. إضافة زر رجوع في صفحة العميل (ClientDetails)

```typescript
// في ClientDetails.tsx
const location = useLocation();
const navigate = useNavigate();

const handleBack = () => {
  if (location.state?.from) {
    navigate(location.state.from, { state: { tab: location.state.tab } });
  } else {
    navigate(-1); // fallback to browser back
  }
};

// في Header:
{location.state?.from && (
  <Button variant="ghost" onClick={handleBack}>
    <ArrowRight className="h-4 w-4 ml-2" />
    رجوع للتقارير
  </Button>
)}
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `supabase/migrations/NEW_*.sql` | إصلاح دالة `report_renewed_clients` |
| `src/pages/PolicyReports.tsx` | تغيير التنقل لاستخدام React Router |
| `src/components/clients/ClientDetails.tsx` | إضافة زر رجوع |

---

## النتيجة المتوقعة

### قبل:
| العميل | الوثائق الجديدة | السعر الجديد |
|--------|----------------|--------------|
| محمد عبد عويسات | **0 وثيقة** ❌ | **₪0** ❌ |

### بعد:
| العميل | الوثائق الجديدة | السعر الجديد |
|--------|----------------|--------------|
| محمد عبد عويسات | **3 وثيقة** ✅ | **₪1,600** ✅ |

---

## الاختبار

1. افتح **تقارير الوثائق → تم التجديد**
2. تأكد أن "محمد عبد عويسات" يعرض العدد والسعر الصحيح
3. اضغط على اسم العميل → يفتح ملفه الشخصي
4. اضغط على زر "رجوع للتقارير" → يعود للصفحة السابقة بدون "Not found"
