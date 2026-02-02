
# خطة: إصلاح خطأ "column p.renewal_status does not exist"

## المشكلة

الـ SQL Migration التي أنشأناها (`20260202145257`) تحتوي على خطأ:
- تستخدم `p.renewal_status` و `p.renewal_notes` مباشرة من جدول `policies`
- لكن هذه الأعمدة **غير موجودة** في جدول `policies`
- البيانات الفعلية موجودة في جدول منفصل `policy_renewal_tracking`

**رسالة الخطأ:**
```
column p.renewal_status does not exist
```

---

## الحل

إنشاء migration جديدة تُصحح الدالتين `report_renewals` و `report_renewals_service`:

### التصحيحات المطلوبة:

#### 1. إضافة JOIN مع `policy_renewal_tracking`:
```sql
-- من:
FROM policies p
JOIN clients c ON c.id = p.client_id
LEFT JOIN cars car ON car.id = p.car_id

-- إلى:
FROM policies p
JOIN clients c ON c.id = p.client_id
LEFT JOIN cars car ON car.id = p.car_id
LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id
```

#### 2. تغيير مصدر `renewal_status`:
```sql
-- من:
p.renewal_status
p.renewal_notes

-- إلى:
COALESCE(prt.renewal_status, 'not_contacted') as rstatus
prt.notes as rnotes
```

#### 3. إضافة `car_numbers` للـ report_renewals (حسب الخطة الأصلية):
```sql
ARRAY_AGG(DISTINCT cp.car_num) FILTER (WHERE cp.car_num IS NOT NULL) as car_nums,
```

#### 4. إضافة البحث برقم السيارة:
```sql
OR car.car_number ILIKE '%' || p_search || '%'
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| **Database Migration (جديدة)** | إصلاح `report_renewals` و `report_renewals_service` مع JOIN صحيح لـ `policy_renewal_tracking` |

---

## SQL Migration المُصحح

```sql
-- Drop existing functions to recreate with correct return type
DROP FUNCTION IF EXISTS public.report_renewals(date, date, text, uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.report_renewals_service(date, integer, text, integer, integer);

-- 1. Fix report_renewals - add car_numbers and search by car_number
CREATE OR REPLACE FUNCTION public.report_renewals(...)
RETURNS TABLE(
  ...
  car_numbers text[],  -- NEW
  ...
)
AS $$
...
WITH client_policies AS (
  SELECT 
    ...
    COALESCE(prt.renewal_status, 'not_contacted') as rstatus,  -- FIXED
    prt.notes as rnotes,  -- FIXED
    car.car_number as car_num
  FROM policies p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN cars car ON car.id = p.car_id
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id  -- FIXED
  WHERE ...
    AND (
      p_search IS NULL
      OR c.full_name ILIKE '%' || p_search || '%'
      ...
      OR car.car_number ILIKE '%' || p_search || '%'  -- NEW: Search by car number
    )
),
aggregated AS (
  SELECT 
    ...
    ARRAY_AGG(DISTINCT cp.car_num) FILTER (WHERE cp.car_num IS NOT NULL) as car_nums,  -- NEW
    ...
)
$$;

-- 2. Fix report_renewals_service (for PDF) - group by client with car_numbers
CREATE OR REPLACE FUNCTION public.report_renewals_service(...)
RETURNS TABLE(
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  policies_count integer,
  earliest_end_date date,
  days_remaining integer,
  total_price numeric,
  car_numbers text[],  -- NEW
  policy_types text[],
  renewal_status text,
  renewal_notes text,
  total_rows bigint
)
AS $$
...
WITH client_policies AS (
  SELECT 
    ...
    COALESCE(prt.renewal_status, 'not_contacted') as rstatus,  -- FIXED
    prt.notes as rnotes  -- FIXED
  FROM policies p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN cars car ON car.id = p.car_id
  LEFT JOIN policy_renewal_tracking prt ON prt.policy_id = p.id  -- FIXED
  ...
),
aggregated AS (
  -- Group by client for PDF report
  SELECT 
    cp.client_id,
    ...
    ARRAY_AGG(DISTINCT cp.car_num) FILTER (...) as car_nums,  -- NEW
    ...
)
$$;
```

---

## النتيجة المتوقعة

بعد تطبيق الإصلاح:
1. صفحة `/reports/policies` ستعمل بشكل صحيح
2. عمود "السيارات" سيظهر في الجدول
3. البحث برقم السيارة سيعمل
4. تقرير PDF سيُنشأ مجمّعاً حسب العميل

---

## اختبار بعد التنفيذ

1. اذهب لصفحة `/reports/policies`
2. تأكد أن الصفحة تعمل بدون خطأ "فشل في تحميل البيانات"
3. تأكد أن عمود السيارات يظهر
4. ابحث برقم سيارة وتأكد أنه يعمل
5. اضغط "تصدير PDF" وتأكد أنه يعمل
