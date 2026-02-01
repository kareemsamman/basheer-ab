

# خطة: أداة اكتشاف وربط الباقات المفقودة

## كيف ستكتشف الأداة الباقات؟

### منطق الاكتشاف التلقائي

ستبحث الأداة عن وثائق تحقق **جميع** الشروط التالية:

1. **نفس العميل** (`client_id`)
2. **نفس السيارة** (`car_id`)
3. **أُنشئت خلال ساعة واحدة** (الفرق بين أول وثيقة وآخر وثيقة < 60 دقيقة)
4. **بدون group_id** (أي لم يتم ربطها كباقة)
5. **غير ملغاة** (`cancelled = false`)
6. **أنواع مختلفة** (مثلاً: THIRD_FULL + ELZAMI + ROAD_SERVICE)

### أمثلة من قاعدة البيانات الحالية

| العميل | رقم السيارة | عدد الوثائق | الأنواع |
|--------|-------------|-------------|---------|
| كريم ابو الفيلات | 6586537 | 2 | THIRD_FULL + ROAD_SERVICE |
| مريم يوسف برك | 8380758 | 3 | ELZAMI + ROAD_SERVICE + THIRD_FULL |
| رشيد ابو ميالة | 8285665 | 3 | THIRD_FULL + ROAD_SERVICE + ELZAMI |
| بيان سموم | 7422461 | 3 | THIRD_FULL + ELZAMI + ROAD_SERVICE |

---

## التصميم التقني

### 1) استعلام SQL للاكتشاف

```sql
WITH policy_candidates AS (
  SELECT 
    p.id, p.client_id, p.car_id, p.policy_type_parent,
    p.insurance_price, p.created_at, p.group_id,
    c.full_name as client_name, cr.car_number
  FROM policies p
  JOIN clients c ON p.client_id = c.id
  JOIN cars cr ON p.car_id = cr.id
  WHERE p.group_id IS NULL
    AND p.cancelled = false
),
grouped AS (
  SELECT 
    client_id, car_id, client_name, car_number,
    COUNT(*) as policy_count,
    array_agg(id ORDER BY created_at) as policy_ids,
    array_agg(policy_type_parent) as types,
    SUM(insurance_price) as total_price,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
  FROM policy_candidates
  GROUP BY client_id, car_id, client_name, car_number
  HAVING COUNT(*) > 1
    AND (MAX(created_at) - MIN(created_at)) < interval '1 hour'
)
SELECT * FROM grouped ORDER BY first_created DESC
```

### 2) عملية الربط

عند ربط الوثائق كباقة:
1. إنشاء `group_id` جديد (UUID)
2. تحديث جميع الوثائق المحددة بنفس `group_id`

```typescript
const groupId = crypto.randomUUID();
await supabase
  .from('policies')
  .update({ group_id: groupId })
  .in('id', policyIds);
```

---

## واجهة المستخدم

### بطاقة الأداة (في صفحة WordPress Import)

```
┌─────────────────────────────────────────────────────────┐
│ 📦 ربط الباقات المفقودة                                │
│ ───────────────────────────────────────────────────────│
│                                                         │
│ تبحث عن وثائق يجب أن تكون ضمن باقة واحدة:              │
│ • نفس العميل والسيارة                                  │
│ • أُنشئت خلال ساعة واحدة                               │
│ • أنواع مختلفة (إلزامي، ثالث/شامل، خدمات طريق)         │
│                                                         │
│ باقات مفقودة تم اكتشافها: [15]                         │
│                                                         │
│ [🔍 اكتشاف الباقات]  [🔗 ربط الكل تلقائياً]            │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐│
│ │ ☑ كريم ابو الفيلات - 6586537                       ││
│ │   2 وثائق: THIRD_FULL, ROAD_SERVICE                ││
│ │   المجموع: 3,000₪                                  ││
│ ├─────────────────────────────────────────────────────┤│
│ │ ☑ مريم يوسف برك - 8380758                         ││
│ │   3 وثائق: ELZAMI, ROAD_SERVICE, THIRD_FULL        ││
│ │   المجموع: 0₪                                      ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ النتائج:                                               │
│ ✅ تم ربط 15 باقة بنجاح                               │
└─────────────────────────────────────────────────────────┘
```

---

## التغييرات المطلوبة

### ملف واحد: `src/pages/WordPressImport.tsx`

#### 1) إضافة State

```typescript
// Missing packages state
const [detectingPackages, setDetectingPackages] = useState(false);
const [missingPackages, setMissingPackages] = useState<MissingPackage[]>([]);
const [linkingPackages, setLinkingPackages] = useState(false);
const [packageLinkStats, setPackageLinkStats] = useState<{
  found: number;
  linked: number;
  errors: string[];
} | null>(null);

interface MissingPackage {
  client_id: string;
  car_id: string;
  client_name: string;
  car_number: string;
  policy_count: number;
  policy_ids: string[];
  types: string[];
  total_price: number;
  first_created: string;
  selected: boolean;
}
```

#### 2) دالة اكتشاف الباقات

```typescript
const detectMissingPackages = async () => {
  setDetectingPackages(true);
  try {
    // Query to find policies that should be packages
    const { data, error } = await supabase.rpc('find_missing_packages');
    
    if (error) throw error;
    
    setMissingPackages((data || []).map(pkg => ({
      ...pkg,
      selected: true // Selected by default
    })));
    
    toast({
      title: "تم الاكتشاف",
      description: `تم العثور على ${data?.length || 0} باقة مفقودة`
    });
  } catch (e: any) {
    toast({ title: "خطأ", description: e.message, variant: "destructive" });
  } finally {
    setDetectingPackages(false);
  }
};
```

#### 3) دالة ربط الباقات

```typescript
const linkMissingPackages = async () => {
  const selected = missingPackages.filter(p => p.selected);
  if (selected.length === 0) {
    toast({ title: "لم يتم تحديد أي باقات" });
    return;
  }
  
  setLinkingPackages(true);
  const stats = { found: selected.length, linked: 0, errors: [] as string[] };
  
  try {
    for (const pkg of selected) {
      // Generate new group_id
      const groupId = crypto.randomUUID();
      
      // Update all policies with this group_id
      const { error } = await supabase
        .from('policies')
        .update({ group_id: groupId })
        .in('id', pkg.policy_ids);
      
      if (error) {
        stats.errors.push(`${pkg.client_name}: ${error.message}`);
      } else {
        stats.linked++;
      }
    }
    
    toast({
      title: "تم الربط",
      description: `تم ربط ${stats.linked} باقة من أصل ${stats.found}`
    });
    
    // Refresh detection
    await detectMissingPackages();
    
  } catch (e: any) {
    stats.errors.push(e.message);
  } finally {
    setPackageLinkStats(stats);
    setLinkingPackages(false);
  }
};
```

### إضافة RPC Function (Database Migration)

```sql
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
      c.full_name as client_name, cr.car_number
    FROM policies p
    JOIN clients c ON p.client_id = c.id
    JOIN cars cr ON p.car_id = cr.id
    WHERE p.group_id IS NULL
      AND p.cancelled = false
  )
  SELECT 
    client_id, car_id, client_name, car_number,
    COUNT(*) as policy_count,
    array_agg(id ORDER BY created_at) as policy_ids,
    array_agg(policy_type_parent::text) as types,
    COALESCE(SUM(insurance_price), 0) as total_price,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
  FROM policy_candidates
  GROUP BY client_id, car_id, client_name, car_number
  HAVING COUNT(*) > 1
    AND (MAX(created_at) - MIN(created_at)) < interval '1 hour'
  ORDER BY MIN(created_at) DESC;
$$;
```

---

## ملخص الملفات

| الملف | التغيير |
|-------|---------|
| Database Migration | إضافة `find_missing_packages()` RPC function |
| `src/pages/WordPressImport.tsx` | إضافة UI + دوال الاكتشاف والربط |

---

## النتيجة المتوقعة

1. ✅ الأداة تكتشف تلقائياً جميع الوثائق التي يجب أن تكون باقات
2. ✅ يمكن للمدير مراجعة القائمة واختيار ما يريد ربطه
3. ✅ زر "ربط الكل" يقوم بإنشاء `group_id` لكل مجموعة
4. ✅ بعد الربط، الوثائق ستظهر كباقات في تفاصيل العميل

