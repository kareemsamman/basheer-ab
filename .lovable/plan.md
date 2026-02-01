
# خطة: تحسين أداة ربط الباقات المفقودة

## المشكلة الحالية

### 1) لماذا لا يظهر "امجد ابو سنينة"؟

العميل لديه **4 وثائق** لنفس السيارة (7875071):

| التاريخ | النوع | السعر |
|---------|-------|-------|
| 2026-01-18 09:17:26 | ELZAMI | 2,296₪ |
| 2026-01-18 09:17:26 | THIRD_FULL/THIRD | 1,000₪ |
| 2026-01-18 09:17:26 | ROAD_SERVICE | 300₪ |
| 2026-02-01 09:07:44 | THIRD_FULL | 3,704₪ |

المشكلة: الاستعلام الحالي يجمع الـ 4 وثائق معاً ويحسب الفرق الزمني = **14 يوم** → أكبر من ساعة → لا يظهر!

الحل: يجب تجميع الوثائق **حسب اليوم + الساعة** وليس فقط حسب العميل والسيارة.

### 2) ميزات مطلوبة

- ✅ إمكانية البحث بالاسم أو رقم السيارة
- ✅ إمكانية التحديد/إلغاء التحديد (موجود بالفعل)
- ❌ حالياً تختار الكل تلقائياً → نريد تعديل هذا

---

## الحل المقترح

### 1) تحسين دالة SQL لتجميع حسب "نافذة زمنية"

بدلاً من تجميع كل الوثائق لنفس العميل+السيارة، سنجمع فقط الوثائق التي أُنشئت خلال نفس الساعة:

```sql
-- تجميع حسب العميل + السيارة + الساعة (rounded to hour)
GROUP BY 
  client_id, 
  car_id, 
  date_trunc('hour', created_at)
```

هذا سيفصل مجموعتين:
- **مجموعة 1**: 3 وثائق من 2026-01-18 → تظهر للربط
- **مجموعة 2**: 1 وثيقة من 2026-02-01 → لا تظهر (وثيقة واحدة فقط)

### 2) إضافة حقل البحث

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 بحث بالاسم أو رقم السيارة...                        │
└─────────────────────────────────────────────────────────┘
```

### 3) تغيير "محددة تلقائياً" إلى "غير محددة"

بدلاً من تحديد الكل تلقائياً، نتركها غير محددة ليختار المستخدم ما يريد.

---

## التغييرات التقنية

### ملف 1: `supabase/migrations/xxx.sql` - تحديث RPC

```sql
DROP FUNCTION IF EXISTS public.find_missing_packages();

CREATE OR REPLACE FUNCTION public.find_missing_packages()
RETURNS TABLE (
  client_id uuid,
  car_id uuid,
  client_name text,
  car_number text,
  policy_count bigint,
  policy_ids uuid[],
  types text[],
  total_price numeric,
  first_created timestamptz,
  last_created timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH policy_candidates AS (
    SELECT 
      p.id, p.client_id, p.car_id, p.policy_type_parent,
      p.insurance_price, p.created_at,
      c.full_name as client_name, cr.car_number,
      -- Create a time window bucket (rounded to hour)
      date_trunc('hour', p.created_at) as time_bucket
    FROM policies p
    JOIN clients c ON p.client_id = c.id
    JOIN cars cr ON p.car_id = cr.id
    WHERE p.group_id IS NULL
      AND p.cancelled = false
  )
  SELECT 
    pc.client_id, 
    pc.car_id, 
    pc.client_name, 
    pc.car_number,
    COUNT(*) as policy_count,
    array_agg(pc.id ORDER BY pc.created_at) as policy_ids,
    array_agg(pc.policy_type_parent::text) as types,
    COALESCE(SUM(pc.insurance_price), 0) as total_price,
    MIN(pc.created_at) as first_created,
    MAX(pc.created_at) as last_created
  FROM policy_candidates pc
  -- Group by time bucket to separate policies created at different times
  GROUP BY pc.client_id, pc.car_id, pc.client_name, pc.car_number, pc.time_bucket
  HAVING COUNT(*) > 1
  ORDER BY MIN(pc.created_at) DESC;
$$;
```

### ملف 2: `src/pages/WordPressImport.tsx`

#### أ) إضافة state للبحث

```typescript
const [packageSearch, setPackageSearch] = useState("");
```

#### ب) تصفية النتائج حسب البحث

```typescript
const filteredPackages = missingPackages.filter(pkg => 
  !packageSearch.trim() || 
  pkg.client_name.includes(packageSearch) ||
  pkg.car_number.includes(packageSearch)
);
```

#### ج) تغيير التحديد الافتراضي

```typescript
setMissingPackages((data || []).map((pkg: any) => ({
  ...pkg,
  selected: false  // ← تغيير من true إلى false
})));
```

#### د) إضافة حقل البحث في UI

```tsx
{/* Search field */}
<div className="relative">
  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input
    placeholder="بحث بالاسم أو رقم السيارة..."
    value={packageSearch}
    onChange={(e) => setPackageSearch(e.target.value)}
    className="pr-10"
  />
</div>
```

#### هـ) عرض النتائج المفلترة

```tsx
{filteredPackages.map((pkg, i) => (
  // ... render each package
))}
```

---

## ملخص الملفات

| الملف | التغيير |
|-------|---------|
| Database Migration | تحديث `find_missing_packages()` لتجميع حسب الساعة |
| `src/pages/WordPressImport.tsx` | إضافة حقل بحث + تغيير التحديد الافتراضي |

---

## النتيجة المتوقعة

1. ✅ وثائق **امجد ابو سنينة** من 2026-01-18 ستظهر كمجموعة منفصلة
2. ✅ يمكن البحث بسهولة عن أي عميل
3. ✅ المستخدم يختار ما يريد ربطه بدلاً من ربط الكل
4. ✅ الوثيقة الجديدة (2026-02-01) لن تُربط مع القديمة لأنها وثيقة واحدة فقط
