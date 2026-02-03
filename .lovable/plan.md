

# خطة: إصلاح خطأ نوع البيانات في دالة التقرير

## المشكلة

خطأ جديد:
```
operator does not exist: policy_type_parent = text
```

## السبب

العمود `policy_type_parent` في جدول `policies` هو من نوع `ENUM` (`policy_type_parent` enum) وليس `TEXT`.

في الدالة نحاول مقارنته مع معامل `text`:
```sql
AND (p_policy_type IS NULL OR p.policy_type_parent = p_policy_type)
```

هذا لا يعمل لأن PostgreSQL لا يسمح بمقارنة `enum` مع `text` مباشرة.

## الحل

إضافة `CAST` لتحويل النص إلى enum:

```sql
AND (p_policy_type IS NULL OR p.policy_type_parent = p_policy_type::policy_type_parent)
```

## التغييرات

| الملف | التغيير |
|-------|---------|
| **Database Migration** | تحديث الدالة لإضافة `::policy_type_parent` cast |

## الكود المصحح

```sql
CREATE OR REPLACE FUNCTION public.report_renewals_service_detailed(
  p_end_month date,
  p_days_remaining integer DEFAULT NULL,
  p_policy_type text DEFAULT NULL
)
...
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ...
  FROM policies p
  ...
  WHERE 
    ...
    AND (p_policy_type IS NULL OR p.policy_type_parent = p_policy_type::policy_type_parent)  -- ✅ إضافة cast
    ...
END;
$$;
```

## النتيجة المتوقعة

- زر "تصدير PDF" يعمل بنجاح
- التقرير يُنشأ مع تفاصيل الوثائق

