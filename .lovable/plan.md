

# خطة: إصلاح نظام الفواتير وإضافة بيانات التواصل

## المشاكل المكتشفة

### 1. الفاتورة الشاملة تعرض `${paymentRows}` كنص حرفي
**الموقع**: `supabase/functions/generate-client-payments-invoice/index.ts` سطر 349

**السبب**: استخدام `\${paymentRows}` مع backslash يجعلها نص عادي بدلاً من template literal interpolation.

**الكود الحالي**:
```javascript
<tbody>
  \${paymentRows}
</tbody>
```

**الحل**: إزالة الـ backslash:
```javascript
<tbody>
  ${paymentRows}
</tbody>
```

### 2. فشل إرسال SMS للوثيقة الجديدة
**السبب**: الـ Edge Function تتطلب رفع ملفات البوليصة أولاً قبل إرسال SMS (شرط أمني).

**من الكود (سطور 140-146)**:
```javascript
if (!insuranceFiles || insuranceFiles.length === 0) {
  return new Response(
    JSON.stringify({ error: `لا يوجد ملفات بوليصة للوثيقة ${policyNumber}، يجب رفع الملفات أولاً` }),
    { status: 400, ... }
  );
}
```

**الحل**: في `PolicySuccessDialog.tsx`:
- إذا لم يكن هناك ملفات بوليصة، يجب إظهار رسالة توضيحية للمستخدم
- تعطيل زر "إرسال SMS" إذا لم يتم رفع الملفات

### 3. بيانات التواصل (الإيميل، الهواتف، العنوان) غير موجودة
**الحل**: إضافة حقول جديدة لجدول `sms_settings`:

| الحقل | النوع | الوصف |
|-------|-------|-------|
| `company_email` | text | البريد الإلكتروني |
| `company_phones` | text[] | أرقام الهواتف (مصفوفة) |
| `company_whatsapp` | text | رقم الواتساب |
| `company_location` | text | العنوان |

---

## التغييرات المطلوبة

### الملف 1: `generate-client-payments-invoice/index.ts`
| السطر | التغيير |
|-------|---------|
| 349 | إزالة `\` من `\${paymentRows}` |
| 370-373 | إضافة بيانات التواصل في الـ footer |

**الـ Footer الجديد**:
```html
<div class="footer">
  <p class="thank-you">شكراً لتعاملكم معنا</p>
  <div class="contact-info">
    <p>📧 ${companySettings.company_email || ''}</p>
    <p>📞 ${companySettings.company_phones?.join(' | ') || ''}</p>
    <p>📍 ${companySettings.company_location || ''}</p>
    <p>💬 واتساب: ${companySettings.company_whatsapp || ''}</p>
  </div>
  <button class="print-button no-print" onclick="window.print()">طباعة الفاتورة</button>
</div>
```

### الملف 2: `PolicySuccessDialog.tsx`
| التغيير | التفاصيل |
|---------|----------|
| التحقق من وجود ملفات | إظهار رسالة إذا لم يتم رفع ملفات |
| تعطيل زر SMS | إذا لم تكن هناك ملفات |

### الملف 3: Database Migration
```sql
ALTER TABLE sms_settings
ADD COLUMN IF NOT EXISTS company_email TEXT,
ADD COLUMN IF NOT EXISTS company_phones TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS company_whatsapp TEXT,
ADD COLUMN IF NOT EXISTS company_location TEXT;

-- Example data
UPDATE sms_settings SET 
  company_email = 'info@basheer-ab.com',
  company_phones = ARRAY['04-6555123', '052-1234567'],
  company_whatsapp = '0521234567',
  company_location = 'الناصرة - شارع المركز';
```

### الملف 4: `src/pages/SmsSettings.tsx`
| التغيير | التفاصيل |
|---------|----------|
| إضافة Tab جديدة | "بيانات الشركة" (Company Info) |
| حقول الإدخال | إيميل، هواتف (متعددة)، واتساب، عنوان |

### الملف 5: جميع Edge Functions التي تولد HTML
تحديث الـ footer في:
- `generate-client-payments-invoice/index.ts`
- `generate-payment-receipt/index.ts`
- `send-invoice-sms/index.ts`
- `send-package-invoice-sms/index.ts`
- `generate-client-report/index.ts`

**كل function يجب أن**:
1. تجلب `sms_settings` لقراءة بيانات التواصل
2. تضيف الـ footer الموحد مع البيانات

---

## الـ Footer الموحد (HTML)

```html
<div class="footer">
  <p class="thank-you">شكراً لتعاملكم معنا 🙏</p>
  <div class="contact-info">
    <div class="contact-row">
      <span>📧</span>
      <a href="mailto:${company_email}">${company_email}</a>
    </div>
    <div class="contact-row">
      <span>📞</span>
      <span>${company_phones.join(' | ')}</span>
    </div>
    <div class="contact-row">
      <span>💬</span>
      <a href="https://wa.me/${company_whatsapp_normalized}">واتساب</a>
    </div>
    <div class="contact-row">
      <span>📍</span>
      <span>${company_location}</span>
    </div>
  </div>
  <button class="print-button no-print" onclick="window.print()">🖨️ طباعة</button>
</div>
```

**CSS للـ Footer**:
```css
.contact-info {
  margin: 15px 0;
  padding: 15px;
  background: #f1f5f9;
  border-radius: 8px;
}
.contact-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  color: #1e3a5f;
}
.contact-row a {
  color: #2563eb;
  text-decoration: none;
}
```

---

## ملخص الملفات

| الملف | النوع | التغيير |
|-------|-------|---------|
| Migration SQL | جديد | إضافة أعمدة بيانات التواصل |
| `SmsSettings.tsx` | تعديل | إضافة tab بيانات الشركة |
| `generate-client-payments-invoice/index.ts` | تعديل | إصلاح `${paymentRows}` + footer |
| `generate-payment-receipt/index.ts` | تعديل | إضافة footer |
| `send-invoice-sms/index.ts` | تعديل | إضافة footer |
| `send-package-invoice-sms/index.ts` | تعديل | إضافة footer |
| `generate-client-report/index.ts` | تعديل | إضافة footer |
| `PolicySuccessDialog.tsx` | تعديل | التحقق من وجود ملفات |

---

## النتائج المتوقعة

- ✅ الفاتورة الشاملة تعرض الدفعات بشكل صحيح
- ✅ رسالة توضيحية عند محاولة إرسال SMS بدون ملفات
- ✅ بيانات التواصل (إيميل، هواتف، واتساب، عنوان) في كل فاتورة
- ✅ إمكانية تعديل بيانات التواصل من صفحة الإعدادات
- ✅ تصميم موحد للـ footer في جميع المستندات

