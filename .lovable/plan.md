
# إصلاح: عداد "تم التجديد" لا يعرض العدد الصحيح

## المشكلة
الـ function `report_renewals_summary` تستبعد الوثائق التي لها تجديد (عبر `NOT EXISTS`) **قبل** أن تعدّها. لذلك تظهر `renewed = 0` بينما لدينا 968 وثيقة مُجددة!

**المنطق الحالي:**
1. ابحث عن وثائق تنتهي هذا الشهر
2. استبعد أي وثيقة لها وثيقة جديدة (NOT EXISTS)
3. اعدّ الحالات

**النتيجة**: الوثائق المُجددة مستبعدة ولا تُعدّ!

## الحل
نُعدّل المنطق ليكون:
1. ابحث عن **جميع** الوثائق التي تنتهي هذا الشهر (بدون استبعاد)
2. أضف عمود `is_auto_renewed` لكل وثيقة لها تجديد تلقائي
3. عند العد:
   - إذا كان `is_auto_renewed = true` ← اعتبرها "renewed"
   - إذا كان `renewal_status = 'renewed'` (يدوي) ← اعتبرها "renewed"

## التغييرات المطلوبة

### 1. تعديل `report_renewals_summary`
```sql
WITH expiring_policies AS (
  SELECT
    p.id,
    p.client_id,
    p.car_id,
    p.insurance_price,
    p.group_id,
    -- Check if there's a newer policy (auto-renewed)
    EXISTS (
      SELECT 1 FROM policies newer
      WHERE newer.client_id = p.client_id
        AND newer.car_id IS NOT DISTINCT FROM p.car_id
        AND newer.policy_type_parent = p.policy_type_parent
        AND newer.cancelled = false
        AND newer.transferred = false
        AND newer.deleted_at IS NULL
        AND newer.start_date > p.start_date
        AND newer.end_date > CURRENT_DATE
    ) AS is_auto_renewed,
    COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
  FROM policies p
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
  WHERE p.end_date BETWEEN v_month_start AND v_month_end
    AND p.cancelled = false
    AND p.transferred = false
    AND p.deleted_at IS NULL
    -- Remove the NOT EXISTS filter here!
    AND (v_policy_type IS NULL OR p.policy_type_parent = v_policy_type)
    AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
    -- ... search filter
),
client_statuses AS (
  SELECT
    client_id,
    -- If any policy is auto-renewed, consider client as renewed
    CASE
      WHEN bool_or(is_auto_renewed) THEN 'renewed'
      WHEN bool_or(renewal_status = 'renewed') THEN 'renewed'
      WHEN bool_or(renewal_status = 'not_contacted') THEN 'not_contacted'
      WHEN bool_or(renewal_status = 'sms_sent') THEN 'sms_sent'
      WHEN bool_or(renewal_status = 'called') THEN 'called'
      ELSE 'not_interested'
    END AS worst_status,
    ...
  FROM expiring_policies
  GROUP BY client_id
)
SELECT
  -- total_expiring should exclude renewed
  COUNT(*) FILTER (WHERE worst_status != 'renewed')::bigint AS total_expiring,
  COUNT(*) FILTER (WHERE worst_status = 'not_contacted')::bigint AS not_contacted,
  ...
  COUNT(*) FILTER (WHERE worst_status = 'renewed')::bigint AS renewed,
  ...
FROM client_statuses;
```

## السيناريو

**قبل الإصلاح:**
| العداد | القيمة |
|--------|--------|
| إجمالي المنتهية | 80 |
| تم التجديد | 0 ❌ |
| لم يتم التواصل | 57 |

**بعد الإصلاح:**
| العداد | القيمة |
|--------|--------|
| إجمالي المنتهية | 50 ← (80 - 30 تم تجديدها) |
| تم التجديد | 30 ✅ |
| لم يتم التواصل | 35 |

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `supabase/migrations/NEW_*.sql` | تعديل function لتشمل الكشف التلقائي عن التجديد |

## التفاصيل التقنية

### SQL Migration الكاملة
```sql
CREATE OR REPLACE FUNCTION public.report_renewals_summary(
  p_end_month text DEFAULT NULL,
  p_policy_type text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_month_start date;
  v_month_end date;
  v_policy_type public.policy_type_parent;
BEGIN
  IF p_end_month IS NOT NULL AND p_end_month != '' THEN
    v_month_start := date_trunc('month', p_end_month::date);
    v_month_end := (date_trunc('month', p_end_month::date) + interval '1 month' - interval '1 day')::date;
  ELSE
    v_month_start := date_trunc('month', CURRENT_DATE);
    v_month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  END IF;
  
  v_policy_type := NULLIF(p_policy_type, '')::public.policy_type_parent;
  
  RETURN QUERY
  WITH expiring_policies AS (
    SELECT
      p.id,
      p.client_id,
      p.car_id,
      p.policy_type_parent AS ptype,
      p.group_id,
      p.insurance_price,
      -- Check if auto-renewed (newer policy exists)
      EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id
          AND newer.car_id IS NOT DISTINCT FROM p.car_id
          AND newer.policy_type_parent = p.policy_type_parent
          AND newer.cancelled = false
          AND newer.transferred = false
          AND newer.deleted_at IS NULL
          AND newer.start_date > p.start_date
          AND newer.end_date > CURRENT_DATE
      ) AS is_auto_renewed,
      COALESCE(prt.renewal_status, 'not_contacted') AS renewal_status
    FROM policies p
    LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
    WHERE p.end_date BETWEEN v_month_start AND v_month_end
      AND p.cancelled = false
      AND p.transferred = false
      AND p.deleted_at IS NULL
      -- Policy type filter
      AND (v_policy_type IS NULL OR p.policy_type_parent = v_policy_type)
      -- Created by filter
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
      -- Search filter
      AND (
        p_search IS NULL OR p_search = '' OR EXISTS (
          SELECT 1 FROM clients c
          WHERE c.id = p.client_id
            AND (
              c.full_name ILIKE '%' || p_search || '%'
              OR c.id_number ILIKE '%' || p_search || '%'
              OR c.phone_number ILIKE '%' || p_search || '%'
              OR c.file_number ILIKE '%' || p_search || '%'
            )
        )
      )
  ),
  client_statuses AS (
    SELECT
      client_id,
      -- Priority: auto-renewed first, then manual status
      CASE
        WHEN bool_or(is_auto_renewed) THEN 'renewed'
        WHEN bool_or(renewal_status = 'renewed') THEN 'renewed'
        WHEN bool_or(renewal_status = 'not_contacted') THEN 'not_contacted'
        WHEN bool_or(renewal_status = 'sms_sent') THEN 'sms_sent'
        WHEN bool_or(renewal_status = 'called') THEN 'called'
        ELSE 'not_interested'
      END AS client_status,
      bool_or(group_id IS NOT NULL) AS has_package,
      SUM(insurance_price) AS client_value
    FROM expiring_policies
    GROUP BY client_id
  )
  SELECT
    -- Total expiring excludes renewed
    COUNT(*) FILTER (WHERE client_status != 'renewed')::bigint AS total_expiring,
    COUNT(*) FILTER (WHERE client_status = 'not_contacted')::bigint AS not_contacted,
    COUNT(*) FILTER (WHERE client_status = 'sms_sent')::bigint AS sms_sent,
    COUNT(*) FILTER (WHERE client_status = 'called')::bigint AS called,
    COUNT(*) FILTER (WHERE client_status = 'renewed')::bigint AS renewed,
    COUNT(*) FILTER (WHERE client_status = 'not_interested')::bigint AS not_interested,
    COUNT(*) FILTER (WHERE has_package = true AND client_status != 'renewed')::bigint AS total_packages,
    COUNT(*) FILTER (WHERE has_package = false AND client_status != 'renewed')::bigint AS total_single,
    COALESCE(SUM(client_value) FILTER (WHERE client_status != 'renewed'), 0)::numeric AS total_value
  FROM client_statuses;
END;
$$;
```

## الاختبار
1. افتح **تقارير الوثائق → التجديدات**
2. اختر شهر فيه وثائق منتهية
3. تأكد أن عداد "تم التجديد" يعرض العدد الصحيح (أي وثيقة لها وثيقة جديدة لاحقة)
