
# خطة: إصلاح حفظ التعديلات في بلاغ الحادث وإضافة زر "العودة للبلاغ"

## المشاكل المُكتشفة

### 1) التعديلات لا تظهر في المعاينة بعد الحفظ
**السبب:** عند النقر على "عرض / طباعة" أو "إعادة الإنشاء"، يتم إنشاء ملف HTML **جديد** على CDN بتوقيت جديد (timestamp). الرابط المحفوظ في قاعدة البيانات يتغير، لكن الملف **القديم** يبقى على CDN.

**المشكلة الرئيسية:**
- عند الضغط على "حفظ" في صفحة المعاينة (CDN HTML)، يتم:
  1. حفظ `edited_fields_json` في قاعدة البيانات ✓
  2. **تحديث الملف الحالي على CDN** ✓
- لكن في AccidentReportForm عند الضغط على "عرض / طباعة"، يتم فتح `report.generated_pdf_url` الذي قد يكون **قديم** أو **لم يُحدَّث** بعد الـ caching

### 2) عدم وجود زر "العودة للبلاغ" في صفحة CDN
الملف HTML على CDN لا يحتوي على زر للعودة إلى صفحة البلاغ في النظام.

---

## الحلول

### الحل 1: إضافة زر "العودة للبلاغ" في HTML المُنشأ

**الملفات:**
- `supabase/functions/generate-accident-pdf/index.ts`
- `supabase/functions/save-accident-edits/index.ts`

**التعديل:** إضافة زر في الـ toolbar:

```html
<button onclick="window.open('${crmBaseUrl}/accidents/${report.id}', '_self')">
  <svg>...</svg>
  العودة للبلاغ
</button>
```

سنحتاج إضافة متغير `CRM_BASE_URL` أو استخدام `window.location.origin` في الـ script.

### الحل 2: تحديث الـ cache في AccidentReportForm

**الملف:** `src/pages/AccidentReportForm.tsx`

عند الضغط على "عرض / طباعة":
- إضافة cache-busting parameter للـ URL
- أو استخدام `fetch` لإعادة تحميل البيانات

```tsx
const handleDownloadPdf = () => {
  if (report?.generated_pdf_url) {
    // Add cache-busting parameter
    const url = new URL(report.generated_pdf_url);
    url.searchParams.set('t', Date.now().toString());
    window.open(url.toString(), "_blank");
  }
};
```

### الحل 3: التحقق من صحة حفظ التعديلات

**التحقق من Edge Function:** التأكد من أن `save-accident-edits` يقوم بـ:
1. حفظ `edited_fields_json` في قاعدة البيانات ✓ (موجود)
2. تحديث الملف HTML على CDN ✓ (موجود)

المشكلة قد تكون في **التوقيت** - الملف يُحدَّث لكن المتصفح يقرأ نسخة cached.

---

## التعديلات المطلوبة

### 1) إضافة زر "العودة للبلاغ" في generate-accident-pdf

**ملف:** `supabase/functions/generate-accident-pdf/index.ts`

في الـ HTML template، إضافة زر جديد في الـ toolbar:

```html
<button onclick="backToReport()" class="back-btn">
  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
  العودة للبلاغ
</button>
```

وإضافة الـ function في JavaScript:

```javascript
function backToReport() {
  // Use lovableproject.com or the actual domain
  window.location.href = 'https://3846f912-c591-4c1e-b01f-723e45f1efc1.lovableproject.com/accidents/' + REPORT_ID;
}
```

### 2) نفس التعديل في save-accident-edits

**ملف:** `supabase/functions/save-accident-edits/index.ts`

نفس الإضافة للزر في HTML المُحدَّث.

### 3) إضافة cache-busting في AccidentReportForm

**ملف:** `src/pages/AccidentReportForm.tsx`

```tsx
const handleDownloadPdf = () => {
  if (report?.generated_pdf_url) {
    // Add timestamp to bust CDN cache
    const cacheBuster = `?cb=${Date.now()}`;
    window.open(report.generated_pdf_url + cacheBuster, "_blank");
  }
};
```

---

## ملخص الملفات

| الملف | النوع | الوصف |
|-------|-------|-------|
| `supabase/functions/generate-accident-pdf/index.ts` | تعديل | إضافة زر "العودة للبلاغ" + styling |
| `supabase/functions/save-accident-edits/index.ts` | تعديل | إضافة زر "العودة للبلاغ" |
| `src/pages/AccidentReportForm.tsx` | تعديل | إضافة cache-busting للـ PDF URL |

---

## التفاصيل التقنية

### زر العودة في HTML

**Style:**
```css
.toolbar button.back-btn {
  background: #6b7280;
}

.toolbar button.back-btn:hover {
  background: #4b5563;
}
```

**Button HTML:**
```html
<button onclick="backToReport()" class="back-btn">
  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
  العودة للبلاغ
</button>
```

**JavaScript:**
```javascript
const CRM_URL = 'https://3846f912-c591-4c1e-b01f-723e45f1efc1.lovableproject.com';

function backToReport() {
  window.location.href = CRM_URL + '/accidents/' + REPORT_ID;
}
```

### Cache-Busting

لحل مشكلة الـ caching في BunnyCDN:
1. إضافة query parameter عشوائي عند فتح الرابط
2. هذا يجبر المتصفح على تحميل نسخة جديدة

---

## النتيجة المتوقعة

1. **صفحة المعاينة على CDN:**
   - تحتوي على زر "العودة للبلاغ" ينقل المستخدم إلى `/accidents/{reportId}`
   - عند الحفظ، يتم تحديث الملف على CDN

2. **صفحة AccidentReportForm:**
   - عند الضغط على "عرض / طباعة"، يتم فتح الملف مع تجاوز الـ cache
   - التعديلات المحفوظة تظهر فوراً

3. **تدفق العمل الكامل:**
   ```
   AccidentReportForm → إنشاء PDF → فتح المعاينة
                                          ↓
                                    تعديل الحقول
                                          ↓
                                    حفظ ← تحديث CDN
                                          ↓
                                    "العودة للبلاغ"
                                          ↓
                                    AccidentReportForm
                                          ↓
                                    "عرض / طباعة" ← يرى التعديلات
   ```
