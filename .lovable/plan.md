
# خطة: إظهار اسم من قام بالتجديد في صفحة "تم التجديد"

## المتطلب

في صفحة `/reports/policies` تبويب "تم التجديد"، إضافة عمود جديد يُظهر **من قام بالتجديد** (أي المستخدم الذي أنشأ الوثيقة الجديدة).

---

## التحليل التقني

### الحالة الحالية:
- الـ RPC function `report_renewed_clients` تُرجع بيانات العميل والوثائق القديمة والجديدة
- الوثائق الجديدة (`new_policy_ids`) موجودة في النتيجة
- كل وثيقة لديها حقل `created_by_admin_id` في جدول `policies`
- يمكن الحصول على اسم المستخدم من جدول `profiles`

### ما يجب إضافته:
- حقل `renewed_by_admin_id` (UUID)
- حقل `renewed_by_name` (اسم من قام بالتجديد)

---

## التغييرات المطلوبة

### 1. تعديل الـ Database Function `report_renewed_clients`

```sql
-- إضافة في قسم renewal_mappings:
np.created_by_admin_id AS renewed_by_admin_id

-- إضافة في قسم client_aggregates:
-- اختيار أحدث مستخدم قام بالتجديد
(ARRAY_AGG(rm.renewed_by_admin_id ORDER BY rm.new_start DESC))[1] AS renewed_by_admin_id

-- إضافة JOIN مع profiles في النتيجة النهائية:
LEFT JOIN profiles p ON p.id = ca.renewed_by_admin_id
...
p.full_name AS renewed_by_name
```

**الـ RETURN TABLE تصبح:**
```sql
RETURNS TABLE(
  ...existing columns...,
  renewed_by_admin_id uuid,
  renewed_by_name text,
  total_count bigint
)
```

---

### 2. تحديث الـ Interface في الـ Frontend

**الملف:** `src/pages/PolicyReports.tsx`

```typescript
// تحديث RenewedClient interface (السطر 186-203)
interface RenewedClient {
  client_id: string;
  client_name: string;
  client_file_number: string | null;
  client_phone: string | null;
  policies_count: number;
  earliest_end_date: string;
  total_insurance_price: number;
  policy_types: string[] | null;
  policy_ids: string[] | null;
  new_policies_count: number;
  new_policy_ids: string[] | null;
  new_policy_types: string[] | null;
  new_total_price: number;
  new_start_date: string | null;
  has_package: boolean;
  renewed_by_admin_id: string | null;  // ← جديد
  renewed_by_name: string | null;       // ← جديد
  total_count: number;
}
```

---

### 3. إضافة عمود "التجديد بواسطة" في الجدول

**الملف:** `src/pages/PolicyReports.tsx`

**في الـ TableHeader (بعد السعر الجديد):**
```tsx
<TableHead className="text-right">التجديد بواسطة</TableHead>
```

**في الـ TableBody (بعد السعر الجديد):**
```tsx
<TableCell>
  {client.renewed_by_name ? (
    <div className="flex items-center gap-2">
      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="text-xs font-medium text-primary">
          {client.renewed_by_name.charAt(0)}
        </span>
      </div>
      <span className="text-sm">{client.renewed_by_name}</span>
    </div>
  ) : (
    <span className="text-muted-foreground text-sm">—</span>
  )}
</TableCell>
```

**تحديث colSpan في الـ Expanded Row:**
```tsx
// من:
<TableCell colSpan={9} className="p-0">
// إلى:
<TableCell colSpan={10} className="p-0">
```

---

## الملفات المتأثرة

| الملف/المكان | التغيير |
|--------------|---------|
| **Database Migration** | تعديل `report_renewed_clients` لإضافة `renewed_by_admin_id` و `renewed_by_name` |
| `src/pages/PolicyReports.tsx` | تحديث interface + إضافة عمود جديد في الجدول |

---

## SQL Migration الكامل

```sql
CREATE OR REPLACE FUNCTION public.report_renewed_clients(
  p_end_month text DEFAULT NULL::text,
  p_policy_type text DEFAULT NULL::text,
  p_created_by uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  policies_count bigint,
  earliest_end_date date,
  total_insurance_price numeric,
  policy_types text[],
  policy_ids uuid[],
  new_policies_count bigint,
  new_policy_ids uuid[],
  new_policy_types text[],
  new_total_price numeric,
  new_start_date date,
  has_package boolean,
  renewed_by_admin_id uuid,
  renewed_by_name text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      p.end_date,
      p.start_date
    FROM policies p
    WHERE p.end_date BETWEEN v_month_start AND v_month_end
      AND p.cancelled = false
      AND p.transferred = false
      AND p.deleted_at IS NULL
      AND (v_policy_type IS NULL OR p.policy_type_parent = v_policy_type)
      AND (p_created_by IS NULL OR p.created_by_admin_id = p_created_by)
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
      AND EXISTS (
        SELECT 1 FROM policies newer
        WHERE newer.client_id = p.client_id
          AND newer.car_id IS NOT DISTINCT FROM p.car_id
          AND newer.policy_type_parent = p.policy_type_parent
          AND newer.start_date > p.start_date
          AND newer.end_date > CURRENT_DATE
          AND newer.cancelled = false
          AND newer.transferred = false
          AND newer.deleted_at IS NULL
      )
  ),
  renewal_mappings AS (
    SELECT DISTINCT ON (ep.id)
      ep.id AS old_policy_id,
      ep.client_id,
      np.id AS new_policy_id,
      np.policy_type_parent AS new_ptype,
      np.insurance_price AS new_price,
      np.start_date AS new_start,
      np.group_id AS new_group_id,
      np.created_by_admin_id AS renewed_by  -- ← جديد
    FROM expiring_policies ep
    JOIN policies np ON 
      np.client_id = ep.client_id
      AND np.car_id IS NOT DISTINCT FROM ep.car_id
      AND np.policy_type_parent = ep.ptype
      AND np.start_date > ep.start_date
      AND np.end_date > CURRENT_DATE
      AND np.cancelled = false
      AND np.transferred = false
      AND np.deleted_at IS NULL
    ORDER BY ep.id, np.start_date ASC
  ),
  client_aggregates AS (
    SELECT
      ep.client_id,
      c.full_name AS client_name,
      c.file_number AS client_file_number,
      c.phone_number AS client_phone,
      COUNT(DISTINCT ep.id) AS policies_count,
      MIN(ep.end_date) AS earliest_end_date,
      COALESCE(SUM(ep.insurance_price), 0) AS total_insurance_price,
      ARRAY_AGG(DISTINCT ep.ptype::text) AS policy_types,
      ARRAY_AGG(DISTINCT ep.id) AS policy_ids,
      COUNT(DISTINCT rm.new_policy_id) AS new_policies_count,
      ARRAY_AGG(DISTINCT rm.new_policy_id) FILTER (WHERE rm.new_policy_id IS NOT NULL) AS new_policy_ids,
      ARRAY_AGG(DISTINCT rm.new_ptype::text) FILTER (WHERE rm.new_ptype IS NOT NULL) AS new_policy_types,
      COALESCE(SUM(DISTINCT rm.new_price) FILTER (WHERE rm.new_policy_id IS NOT NULL), 0) AS new_total_price,
      MIN(rm.new_start) AS new_start_date,
      bool_or(ep.group_id IS NOT NULL OR rm.new_group_id IS NOT NULL) AS has_package,
      -- جديد: اختيار أول مستخدم قام بالتجديد (حسب تاريخ البدء)
      (ARRAY_AGG(rm.renewed_by ORDER BY rm.new_start ASC) FILTER (WHERE rm.renewed_by IS NOT NULL))[1] AS renewed_by_admin_id
    FROM expiring_policies ep
    JOIN clients c ON c.id = ep.client_id
    LEFT JOIN renewal_mappings rm ON rm.old_policy_id = ep.id
    GROUP BY ep.client_id, c.full_name, c.file_number, c.phone_number
  )
  SELECT
    ca.client_id,
    ca.client_name,
    ca.client_file_number,
    ca.client_phone,
    ca.policies_count,
    ca.earliest_end_date,
    ca.total_insurance_price,
    ca.policy_types,
    ca.policy_ids,
    ca.new_policies_count,
    ca.new_policy_ids,
    ca.new_policy_types,
    ca.new_total_price,
    ca.new_start_date,
    ca.has_package,
    ca.renewed_by_admin_id,
    pr.full_name AS renewed_by_name,  -- ← جديد
    COUNT(*) OVER()::bigint AS total_count
  FROM client_aggregates ca
  LEFT JOIN profiles pr ON pr.id = ca.renewed_by_admin_id  -- ← جديد
  ORDER BY ca.earliest_end_date ASC, ca.client_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
```

---

## النتيجة المتوقعة

| العميل | الهاتف | ... | السعر الجديد | التجديد بواسطة |
|--------|--------|-----|--------------|----------------|
| جهاد ابو خلف | 0522387817 | ... | ₪5,500 | 🟢 raghda |
| ناجح ابو حلاوة | 0528588052 | ... | ₪3,361 | 🟢 أحمد |
| ... | ... | ... | ... | ... |

---

## اختبار بعد التنفيذ

1. افتح صفحة `/reports/policies`
2. اذهب لتبويب "تم التجديد"
3. تأكد أن عمود "التجديد بواسطة" يظهر
4. تأكد أن الأسماء تظهر بشكل صحيح (raghda، أحمد، إلخ)
5. إذا لم يكن هناك مستخدم، يظهر "—"
