
# 3 تعديلات: تسعير متدرج + تاريخ الإصدار + ملحقات التسوية

---

## 1. تسعير متدرج لشركة اراضي مقدسة (Tiered FULL_PERCENT)

### المشكلة
حالياً يوجد قاعدة واحدة `FULL_PERCENT` لشركة اراضي مقدسة. المطلوب نسبتين مختلفتين حسب قيمة السيارة:
- قيمة 60,000 - 100,000 = **1.75%**
- قيمة أكثر من 100,000 = **2%**

### الحل
- اضافة عمودين جديدين في جدول `pricing_rules`: `min_car_value` و `max_car_value` (nullable)
- تعديل القاعدة الحالية (1.75%) لتكون مقيدة بـ `max_car_value = 100000`
- اضافة قاعدة جديدة (2%) مقيدة بـ `min_car_value = 100001`
- تعديل `pricingCalculator.ts` ليأخذ بعين الاعتبار نطاق قيمة السيارة عند البحث عن `FULL_PERCENT`
- تعديل واجهة `PricingRulesDrawer` لعرض حقول نطاق قيمة السيارة

### التفاصيل التقنية

**Database Migration:**
```text
ALTER TABLE pricing_rules ADD COLUMN min_car_value numeric DEFAULT NULL;
ALTER TABLE pricing_rules ADD COLUMN max_car_value numeric DEFAULT NULL;

-- Update existing 1.75% rule to apply for cars <= 100,000
UPDATE pricing_rules SET max_car_value = 100000 
WHERE id = 'ca044a6a-5c88-43ed-9a2d-6c7c1c68c5bf';

-- Revert value back to 1.75 (already done)

-- Add new 2% rule for cars > 100,000
INSERT INTO pricing_rules (company_id, rule_type, policy_type_parent, age_band, car_type, value, min_car_value)
SELECT company_id, 'FULL_PERCENT', 'THIRD_FULL', 'UP_24', 'car', 2.0, 100001
FROM pricing_rules WHERE id = 'ca044a6a-5c88-43ed-9a2d-6c7c1c68c5bf';
```

**pricingCalculator.ts changes:**
- Modify `getRuleValue` to accept `carValue` parameter
- When looking up `FULL_PERCENT`, filter rules by `min_car_value` / `max_car_value` range
- Rules without range values act as fallback (existing behavior preserved)

---

## 2. تاريخ الإصدار (Issue Date) للوثائق ثالث/شامل

### المشكلة
بعض الوثائق تُجدد في شهر 1 لكن تبدأ في شهر 2. الشركة تحسبها على شهر 1 (شهر الإصدار). حالياً لا يوجد حقل لتاريخ الإصدار.

### الحل
- اضافة عمود `issue_date` (date, nullable) في جدول `policies`
- القيمة الافتراضية = `start_date` (يتم تعبئته تلقائياً)
- يمكن تغييره يدوياً إذا كان مختلفاً عن تاريخ البداية
- عرض الحقل في معالج إنشاء الوثيقة (Step3) لأنواع ثالث/شامل
- في صفحة تفاصيل تسوية الشركة: عرض عمود "تاريخ الإصدار" واستخدامه في الفلترة بدل `start_date`

### التفاصيل التقنية

**Database Migration:**
```text
ALTER TABLE policies ADD COLUMN issue_date date DEFAULT NULL;
-- Backfill existing policies
UPDATE policies SET issue_date = start_date WHERE issue_date IS NULL;
```

**UI Changes:**
- `Step3PolicyDetails.tsx`: اضافة حقل "تاريخ الإصدار" (ArabicDatePicker) يظهر فقط لأنواع THIRD_FULL، القيمة الافتراضية = start_date
- `CompanySettlementDetail.tsx`: اضافة عمود "تاريخ الإصدار" في الجدول + استخدامه في الفلتر الزمني
- `PolicyDetailsDrawer.tsx`: عرض تاريخ الإصدار في تفاصيل الوثيقة

---

## 3. ملحقات التسوية (Settlement Supplements)

### المشكلة
المستخدم يريد اضافة بنود يدوية (ملحقات) في تقرير تسوية الشركة - مثلاً تعديلات أو اضافات بمبالغ موجبة أو سالبة.

### الحل
- انشاء جدول جديد `settlement_supplements` مع الحقول:
  - `id`, `company_id`, `description` (نص حر مثل "ملحق" أو أي نص)
  - `insurance_price` (default 0), `company_payment` (المبلغ + أو -)
  - `profit` (default 0), `created_at`, `created_by_admin_id`
  - `settlement_month` (date) - لربط الملحق بفترة معينة
- عرض زر "اضافة ملحق" في صفحة `CompanySettlementDetail`
- الملحقات تظهر في نفس الجدول مع الوثائق (بلون مميز)
- المبالغ تُضاف للإجماليات (المستحق للشركة + الربح)
- يمكن تعديل وحذف الملحقات

### التفاصيل التقنية

**Database Migration:**
```text
CREATE TABLE settlement_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES insurance_companies(id),
  description text NOT NULL DEFAULT 'ملحق',
  insurance_price numeric NOT NULL DEFAULT 0,
  company_payment numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  settlement_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_admin_id uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settlement_supplements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage supplements"
  ON settlement_supplements FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
```

**UI Changes in CompanySettlementDetail.tsx:**
- زر "اضافة ملحق" (+) بجانب عنوان الوثائق
- مودال/فورم لإدخال: الوصف (نص حر)، المستحق للشركة (+ أو -)، سعر التأمين (default 0)، الربح (default 0)
- الملحقات تظهر في نفس الجدول بصف مميز (لون مختلف/badge "ملحق")
- يمكن تعديل وحذف كل ملحق
- المبالغ تُحسب في الإجماليات (summary cards)

---

## ملخص الملفات المتأثرة

| الملف | التعديل |
|-------|---------|
| **Database** | اضافة `min_car_value`, `max_car_value` لـ `pricing_rules` + `issue_date` لـ `policies` + جدول `settlement_supplements` |
| `src/lib/pricingCalculator.ts` | دعم نطاق قيمة السيارة في FULL_PERCENT |
| `src/components/policies/wizard/Step3PolicyDetails.tsx` | حقل تاريخ الإصدار |
| `src/pages/CompanySettlementDetail.tsx` | عمود تاريخ الإصدار + ملحقات + فلتر بتاريخ الإصدار |
| `src/components/companies/PricingRulesDrawer.tsx` | حقول نطاق قيمة السيارة |
| `src/components/policies/PolicyDetailsDrawer.tsx` | عرض تاريخ الإصدار |
