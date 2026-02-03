
# خطة: إصلاح خطأ "فشل في تحميل ملخص التجديدات"

## المشكلة

في صفحة `/reports/policies` تبويب "التجديدات"، يظهر خطأ:
**"فشل في تحميل ملخص التجديدات"**

## التشخيص

بعد فحص قاعدة البيانات، وجدت **تعارض في تعريفات دالة `report_renewals_summary`**:

| النسخة | المعامل الأول | الأعمدة المُرجعة |
|--------|---------------|------------------|
| القديمة (صحيحة) | `TEXT` | `not_contacted`, `sms_sent`, `called`, `renewed`, `not_interested`, `total_packages`, `total_single`, `total_value` |
| الجديدة (خاطئة) | `DATE` | `urgent_count`, `warning_count`, `normal_count`, `total_price` |

Migration الأخير (`20260203113640`) أنشأ نسخة جديدة بتوقيع `DATE` ونوع أعمدة مختلفة تماماً.

الكود في `PolicyReports.tsx` (سطر 408-413) يستدعي الدالة ويتوقع:
```typescript
interface RenewalSummary {
  total_expiring: number;
  not_contacted: number;  // ❌ غير موجود في النسخة الجديدة
  sms_sent: number;       // ❌ غير موجود
  called: number;         // ❌ غير موجود
  renewed: number;        // ❌ غير موجود
  not_interested: number; // ❌ غير موجود
  total_packages: number; // ❌ غير موجود
  total_single: number;   // ❌ غير موجود
  total_value: number;    // ❌ غير موجود
}
```

## الحل

### تحديث migration لإصلاح الدالة

سنُحدّث دالة `report_renewals_summary` لتوحيد التوقيع وإرجاع جميع الأعمدة المطلوبة مع تضمين فلتر استبعاد الوثائق المُجددة.

```sql
-- حذف النسختين المتعارضتين
DROP FUNCTION IF EXISTS public.report_renewals_summary(date, text, uuid, text);
DROP FUNCTION IF EXISTS public.report_renewals_summary(text, text, uuid, text);

-- إنشاء نسخة موحدة بتوقيع TEXT
CREATE OR REPLACE FUNCTION public.report_renewals_summary(
  p_end_month text DEFAULT NULL,
  p_policy_type text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  total_expiring bigint,
  not_contacted bigint,
  sms_sent bigint,
  called bigint,
  renewed bigint,
  not_interested bigint,
  total_packages bigint,
  total_single bigint,
  total_value numeric
)
...
```

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| قاعدة البيانات (Migration) | حذف الدوال المتعارضة وإنشاء نسخة موحدة |

## النتيجة المتوقعة

1. ✅ تبويب "التجديدات" سيعمل بدون أخطاء
2. ✅ البطاقات الإحصائية ستعرض الأرقام الصحيحة (إجمالي، لم يتم التواصل، SMS، إلخ)
3. ✅ استبعاد الوثائق المُجددة تلقائياً من العدد
4. ✅ لن يكون هناك تعارض في تعريفات الدوال

## التفاصيل التقنية

### المنطق المُحدّث في الدالة:

```sql
-- 1. جلب الوثائق المنتهية مع فلتر استبعاد المُجددة
WITH expiring_policies AS (
  SELECT p.id, p.client_id, p.group_id, p.insurance_price,
    -- كشف الوثائق المُجددة تلقائياً
    EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.car_id IS NOT DISTINCT FROM p.car_id
        AND newer.policy_type_parent = p.policy_type_parent
        AND newer.cancelled = false
        AND newer.transferred = false
        AND newer.start_date > p.start_date
        AND newer.end_date > CURRENT_DATE
    ) AS is_auto_renewed,
    COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
  FROM policies p
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
  WHERE p.end_date BETWEEN month_start AND month_end
    AND p.cancelled = false AND p.transferred = false
    AND p.deleted_at IS NULL
    -- الفلاتر المُمررة...
)

-- 2. تجميع حسب العميل
SELECT
  COUNT(*) FILTER (WHERE status != 'renewed') AS total_expiring,
  COUNT(*) FILTER (WHERE status = 'not_contacted') AS not_contacted,
  COUNT(*) FILTER (WHERE status = 'sms_sent') AS sms_sent,
  COUNT(*) FILTER (WHERE status = 'called') AS called,
  COUNT(*) FILTER (WHERE status = 'renewed') AS renewed,
  COUNT(*) FILTER (WHERE status = 'not_interested') AS not_interested,
  -- باقات / مفردة
  COUNT(*) FILTER (WHERE has_package AND status != 'renewed') AS total_packages,
  COUNT(*) FILTER (WHERE NOT has_package AND status != 'renewed') AS total_single,
  SUM(value) FILTER (WHERE status != 'renewed') AS total_value
FROM client_statuses;
```
