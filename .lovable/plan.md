
# خطة إضافة حقول بلاغ الحادث وتوقيع العميل عبر SMS

## ملخص المتطلبات
بناءً على تحليل ملفات PDF الثلاثة (الأراضي المقدسة، المشرق، الأهلية) وطلب المستخدم:
1. إضافة الحقول المفقودة من نماذج شركات التأمين
2. إنشاء نظام توقيع العميل على بلاغ الحادث (مشابه لنظام توقيع العميل الحالي)
3. إرسال رابط التوقيع عبر SMS أو إدخال رقم الهاتف يدوياً

---

## الحقول المفقودة من نماذج PDF

### بيانات صاحب السيارة (Owner Info)
| الحقل | النوع | الوصف |
|-------|-------|-------|
| owner_name | TEXT | اسم صاحب السيارة (إذا مختلف عن السائق) |
| owner_phone | TEXT | رقم جوال صاحب السيارة |

### بيانات السائق الإضافية (Driver Extended)
| الحقل | النوع | الوصف |
|-------|-------|-------|
| driver_license_grade | TEXT | درجة رخصة السائق |
| driver_license_issue_date | DATE | تاريخ إصدار الرخصة |

### بيانات السيارة الإضافية (Vehicle Extended)
| الحقل | النوع | الوصف |
|-------|-------|-------|
| vehicle_chassis_number | TEXT | رقم الشاصي |
| vehicle_speed_at_accident | TEXT | سرعة السيارة وقت الحادث |

### بيانات الإصابات الشخصية (Personal Injuries Table)
سيتم إنشاء جدول منفصل `accident_injured_persons`:
| الحقل | النوع | الوصف |
|-------|-------|-------|
| injured_name | TEXT | اسم المصاب |
| injured_age | INT | عمره |
| injured_address | TEXT | عنوانه |
| injured_occupation | TEXT | طبيعة العمل |
| injured_salary | TEXT | الراتب/شيكل |
| injury_type | TEXT | نوع الإصابة |
| sort_order | INT | ترتيب |

### ملاحظات الموظف (Employee Notes)
| الحقل | النوع | الوصف |
|-------|-------|-------|
| employee_notes | TEXT | ملاحظات الموظف |
| employee_signature_date | DATE | تاريخ توقيع الموظف |

### توقيع العميل (Customer Signature)
| الحقل | النوع | الوصف |
|-------|-------|-------|
| customer_signature_url | TEXT | رابط صورة توقيع العميل |
| customer_signed_at | TIMESTAMP | تاريخ ووقت التوقيع |
| customer_signature_ip | TEXT | عنوان IP |
| signature_token | TEXT | Token للتوقيع |
| signature_token_expires_at | TIMESTAMP | انتهاء صلاحية التوكن |

---

## التغييرات التقنية

### 1. Migration SQL
إضافة الأعمدة الجديدة لجدول `accident_reports`:

```sql
ALTER TABLE public.accident_reports
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone TEXT,
  ADD COLUMN IF NOT EXISTS driver_license_grade TEXT,
  ADD COLUMN IF NOT EXISTS driver_license_issue_date DATE,
  ADD COLUMN IF NOT EXISTS vehicle_chassis_number TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_speed_at_accident TEXT,
  ADD COLUMN IF NOT EXISTS employee_notes TEXT,
  ADD COLUMN IF NOT EXISTS employee_signature_date DATE,
  ADD COLUMN IF NOT EXISTS customer_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS customer_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_signature_ip TEXT,
  ADD COLUMN IF NOT EXISTS signature_token TEXT,
  ADD COLUMN IF NOT EXISTS signature_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_phone_override TEXT;
```

إنشاء جدول المصابين:

```sql
CREATE TABLE public.accident_injured_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_report_id UUID NOT NULL REFERENCES accident_reports(id) ON DELETE CASCADE,
  injured_name TEXT NOT NULL,
  injured_age INT,
  injured_address TEXT,
  injured_occupation TEXT,
  injured_salary TEXT,
  injury_type TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Edge Functions

#### `send-accident-signature-sms`
إنشاء Edge Function جديدة لإرسال رابط التوقيع على بلاغ الحادث:
- المدخلات: `accident_report_id`, `phone_number_override` (اختياري)
- يستخدم رقم هاتف العميل أو الرقم المدخل يدوياً
- يولد Token آمن وصفحة HTML للتوقيع
- يرفع الصفحة إلى Bunny CDN
- يرسل SMS مع الرابط

#### `submit-accident-signature`
Edge Function لاستلام التوقيع من العميل:
- المدخلات: `token`, `signature_data_url`
- يتحقق من صحة Token وعدم انتهاء صلاحيته
- يرفع صورة التوقيع إلى Bunny CDN
- يحدث `accident_reports` بـ:
  - `customer_signature_url`
  - `customer_signed_at`
  - `customer_signature_ip`
- يلغي Token بعد الاستخدام

### 3. واجهة المستخدم (UI)

#### تحديث `AccidentReportForm.tsx`
- إضافة Tab جديد "توقيع العميل"
- عرض حالة التوقيع (تم / لم يتم)
- زر "إرسال رابط التوقيع"
- حقل لإدخال رقم هاتف بديل (اختياري)
- معاينة صورة التوقيع بعد التوقيع
- إضافة الحقول الجديدة في tabs الموجودة

#### تحديث الحقول الموجودة
- Tab "صاحب السيارة": إضافة اسم صاحب السيارة ورقم جواله
- Tab "السائق": إضافة درجة الرخصة وتاريخ إصدارها
- Tab "السيارة": إضافة رقم الشاصي وسرعة السيارة
- Tab جديد "المصابين": جدول لإدارة المصابين (إضافة/تعديل/حذف)
- Tab "ملاحظات الموظف": حقل ملاحظات وتاريخ التوقيع

### 4. صفحة التوقيع للعميل (HTML)
- تصميم مطابق لموقع AB Insurance
- عرض بيانات الحادث الأساسية
- Canvas للتوقيع
- موافقة على صحة البيانات
- زر إرسال

### 5. تحديث توليد PDF
تعديل `generate-accident-pdf` لإضافة:
- صورة توقيع العميل في المكان المخصص ("مكان التوقيع")
- الحقول الجديدة في الأماكن المناسبة

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| Migration SQL | جديد |
| `supabase/functions/send-accident-signature-sms/index.ts` | جديد |
| `supabase/functions/submit-accident-signature/index.ts` | جديد |
| `src/pages/AccidentReportForm.tsx` | تعديل كبير |
| `src/components/accident-reports/InjuredPersonsSection.tsx` | جديد |
| `src/components/accident-reports/AccidentSignatureSection.tsx` | جديد |
| `supabase/functions/generate-accident-pdf/index.ts` | تعديل |
| `src/integrations/supabase/types.ts` | تحديث تلقائي |

---

## سير العمل (Workflow)

```text
1. الموظف يملأ بلاغ الحادث بالحقول الجديدة
2. يضغط "إرسال رابط التوقيع"
   ├── يستخدم رقم هاتف العميل افتراضياً
   └── أو يدخل رقم هاتف بديل
3. العميل يستلم SMS برابط
4. العميل يفتح الرابط على موبايله
5. يرى بيانات الحادث ويوقع
6. يضغط "إرسال التوقيع"
7. التوقيع يظهر في النظام
8. عند توليد PDF، التوقيع يظهر في "مكان التوقيع"
```

---

## الأمان
- Token عشوائي 32 حرف
- صلاحية 24 ساعة
- Rate limiting: 15 محاولة/ساعة/IP
- Token يُلغى بعد الاستخدام
- تسجيل IP و User Agent

