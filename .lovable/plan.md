

# خطة: إصلاح حساب الديون في RPC - الفرق بين ₪11,400 و ₪15,200

## ملخص المشكلة

العميل **اشرف زياد ناصر**:
- صفحة ملف العميل: **₪15,200** ✅ (صحيح)
- صفحة متابعة الديون: **₪11,400** ❌ (خطأ)

**الفرق = ₪3,800** (دين باقة كاملة مفقودة!)

---

## تشخيص السبب الجذري

### المشكلة في دالة `report_client_debts` RPC

الحساب الحالي في السطور 48-70:

```sql
-- 1. حساب المدفوعات لكل باقة (كل الوثائق بما فيها الإلزامي)
group_payments AS (
  SELECT p.group_id, SUM(pp.amount) AS paid   -- ← جميع الدفعات
  FROM policies p ...
),
-- 2. حساب الأسعار لكل باقة (بدون الإلزامي)  
group_prices AS (
  SELECT p.group_id, SUM(p.insurance_price) AS price
  FROM policies p
  WHERE p.policy_type_parent <> 'ELZAMI'  -- ← فقط غير الإلزامي
  ...
),
-- 3. دمج الأسعار والمدفوعات للباقات
group_debts AS (
  SELECT
    gpr.price,                           -- السعر بدون إلزامي
    gpa.paid,                            -- جميع الدفعات
    gpr.price - gpa.paid AS remaining    -- ← خطأ!
  ...
)
```

### المشكلة الرياضية:

| الباقة | السعر الكلي | سعر غير إلزامي | جميع الدفعات | المتبقي الصحيح | المتبقي الخاطئ |
|--------|-------------|----------------|--------------|----------------|----------------|
| 5c3f8f | 6,524 | 4,800 | 1,724 | **4,800** | 3,076 |
| 73538a | 5,333 | 3,300 | 2,033 | **3,300** | 1,267 |
| c1b342 | 4,805 | 3,300 | 1,505 | **3,300** | 1,795 |
| cc912f | 7,928 | 3,800 | 4,128 | **3,800** | **-328** (مفقودة!) |
| **المجموع** | | | | **15,200** | 6,138 |

**السبب:** عندما تكون الدفعات أكبر من سعر غير الإلزامي، يصبح المتبقي سالبًا ويُستبعد!

---

## الحل الصحيح

### المنطق المطلوب:

```
المتبقي للوكالة = (سعر الباقة الكلي - جميع الدفعات) - سعر الإلزامي
               = max(0, السعر الكلي - الدفعات) بحيث لا يتجاوز سعر غير الإلزامي
```

أو بشكل أبسط:
```
المتبقي = min(سعر_غير_الإلزامي, السعر_الكلي - الدفعات)
```

### الإصلاح في SQL:

```sql
group_debts AS (
  SELECT
    gpr.group_id,
    gpr.non_elzami_price AS agency_price,
    gfp.full_price,
    gpa.paid,
    -- المتبقي = أقل قيمة بين:
    -- 1. سعر غير الإلزامي (الحد الأقصى للدين)
    -- 2. الفرق بين السعر الكلي والمدفوعات (إذا موجب)
    GREATEST(0, LEAST(
      gpr.non_elzami_price,
      gfp.full_price - COALESCE(gpa.paid, 0)
    )) AS remaining
  FROM group_non_elzami_prices gpr
  JOIN group_full_prices gfp ON gfp.group_id = gpr.group_id
  LEFT JOIN group_payments gpa ON gpa.group_id = gpr.group_id
)
```

---

## التغييرات المطلوبة

### 1. تحديث دالة `report_client_debts`

**الملف:** `supabase/migrations/[new_migration].sql`

تعديل CTEs:
1. إضافة CTE لحساب السعر الكلي للباقة
2. تعديل `group_debts` لاستخدام صيغة `LEAST(non_elzami, full - paid)`

### 2. تحديث دالة `report_client_debts_summary`

نفس التعديل لضمان تطابق الأرقام

### 3. تحديث دالة `report_debt_policies_for_clients`

لعرض المتبقي الصحيح لكل وثيقة

---

## SQL المقترح

```sql
-- Migration: Fix debt calculation for packages

CREATE OR REPLACE FUNCTION report_client_debts(...)
RETURNS TABLE(...) AS $function$
BEGIN
  RETURN QUERY
  WITH
  -- 1. السعر الكلي للباقة (مع الإلزامي)
  group_full_prices AS (
    SELECT p.group_id, SUM(p.insurance_price) AS full_price
    FROM policies p
    WHERE p.group_id IS NOT NULL
      AND p.cancelled = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
    GROUP BY p.group_id
  ),
  
  -- 2. سعر غير الإلزامي (دين الوكالة)
  group_non_elzami_prices AS (
    SELECT p.group_id, SUM(p.insurance_price) AS non_elzami_price
    FROM policies p
    WHERE p.group_id IS NOT NULL
      AND p.policy_type_parent <> 'ELZAMI'
      AND p.cancelled = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
    GROUP BY p.group_id
  ),
  
  -- 3. جميع الدفعات للباقة
  group_payments AS (
    SELECT p.group_id, 
           COALESCE(SUM(pp.amount) FILTER (WHERE NOT COALESCE(pp.refused, FALSE)), 0) AS paid
    FROM policies p
    LEFT JOIN policy_payments pp ON pp.policy_id = p.id
    WHERE p.group_id IS NOT NULL
      AND p.cancelled = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
    GROUP BY p.group_id
  ),
  
  -- 4. حساب الدين الصحيح للباقات
  group_debts AS (
    SELECT
      gnp.group_id,
      gnp.non_elzami_price AS price,
      gpa.paid,
      -- المتبقي للوكالة = min(سعر_غير_الإلزامي, السعر_الكلي - المدفوع)
      GREATEST(0, LEAST(
        gnp.non_elzami_price,
        gfp.full_price - COALESCE(gpa.paid, 0)
      )) AS remaining
    FROM group_non_elzami_prices gnp
    JOIN group_full_prices gfp ON gfp.group_id = gnp.group_id
    LEFT JOIN group_payments gpa ON gpa.group_id = gnp.group_id
    WHERE LEAST(gnp.non_elzami_price, gfp.full_price - COALESCE(gpa.paid, 0)) > 0
  ),
  
  -- ... باقي CTEs كما هي
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `supabase/migrations/new.sql` | تحديث 3 دوال RPC |

---

## النتيجة المتوقعة

| الباقة | قبل الإصلاح | بعد الإصلاح |
|--------|-------------|-------------|
| 5c3f8f | 3,076 | **4,800** |
| 73538a | 1,267 | **3,300** |
| c1b342 | 1,795 | **3,300** |
| cc912f | **0** (مفقودة) | **3,800** |
| **المجموع** | **6,138** | **15,200** ✅ |

الآن صفحة متابعة الديون ستعرض **₪15,200** مطابقة لملف العميل.

---

## ملاحظة تقنية

الصيغة `LEAST(non_elzami, full - paid)` تضمن:
- إذا دفع العميل الإلزامي فقط → المتبقي = سعر غير الإلزامي بالكامل
- إذا دفع أكثر من الإلزامي → المتبقي ينقص من غير الإلزامي
- إذا دفع كل شيء → المتبقي = 0

