

# خطة: إصلاح مشكلة الـ Cache وجعل رابط المعاينة ثابت

## المشكلة الحالية

1. **كل مرة يتم إنشاء الـ PDF**، يُنشأ ملف جديد بتوقيت جديد:
   ```
   /accident-reports/{report_id}/2026-01-31T10-21-29-608Z.html
   /accident-reports/{report_id}/2026-01-31T10-34-14-676Z.html  ← ملف جديد!
   ```
   
2. **عند الحفظ من صفحة المعاينة**، يتم تحديث الملف الموجود، لكن:
   - الـ cache-busting (`?cb=...`) لا يكفي لأن BunnyCDN قد يحتفظ بنسخة مخبأة
   - أو أن الملف لم يُحدَّث فعلياً

3. **المستخدم لا يرى التغييرات** لأن:
   - إما يتم فتح ملف قديم
   - أو الـ CDN يقدم نسخة cached

---

## الحل: رابط ثابت + تحديث في نفس المكان + Purge Cache

### 1) استخدام رابط ثابت لكل بلاغ

**قبل:**
```
/accident-reports/{report_id}/2026-01-31T10-21-29-608Z.html
```

**بعد:**
```
/accident-reports/{report_id}/report.html
```

هذا يعني:
- كل بلاغ له ملف واحد فقط: `report.html`
- عند الإنشاء أو الحفظ، يتم **استبدال** نفس الملف
- الرابط لا يتغير أبداً

### 2) تفعيل Bunny Purge API

عند كل حفظ أو إنشاء:
1. رفع الملف الجديد على CDN (يستبدل القديم)
2. طلب `Purge` من Bunny API لإزالة الـ cache

```typescript
// Purge cache after upload
const purgeUrl = `https://api.bunny.net/purge?url=${encodeURIComponent(cdnUrl)}`;
await fetch(purgeUrl, {
  method: 'POST',
  headers: { 'AccessKey': BUNNY_API_KEY }
});
```

### 3) إزالة الـ timestamp من اسم الملف

في `generate-accident-pdf` و `save-accident-edits`:

```typescript
// Before:
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `accident-reports/${report.id}/${timestamp}.html`;

// After:
const filename = `accident-reports/${report.id}/report.html`;
```

---

## التعديلات المطلوبة

### 1) ملف `supabase/functions/generate-accident-pdf/index.ts`

**التغييرات:**
- استخدام اسم ملف ثابت `report.html` بدلاً من timestamp
- إضافة Purge request بعد الرفع
- التحقق إذا كان الملف موجود (سيُستبدل تلقائياً)

```typescript
// Fixed filename
const filename = `accident-reports/${report.id}/report.html`;

// Upload (overwrites existing)
await fetch(uploadUrl, { method: "PUT", ... });

// Purge CDN cache
const purgeUrl = `https://api.bunny.net/purge?url=${encodeURIComponent(cdnUrl)}`;
await fetch(purgeUrl, {
  method: 'POST',
  headers: { 'AccessKey': bunnyStorageKey }
});
```

### 2) ملف `supabase/functions/save-accident-edits/index.ts`

**التغييرات:**
- نفس المنطق: استخدام رابط ثابت
- إضافة Purge request بعد الحفظ

```typescript
// Extract path from existing URL or use fixed path
const storagePath = `accident-reports/${accident_report_id}/report.html`;
const cdnUrl = `${bunnyCdnUrl}/${storagePath}`;

// Upload updated HTML
await fetch(uploadUrl, { method: "PUT", ... });

// Purge CDN cache to show changes immediately
await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(cdnUrl)}`, {
  method: 'POST',
  headers: { 'AccessKey': bunnyStorageKey }
});
```

### 3) ملف `src/pages/AccidentReportForm.tsx`

**التغييرات:**
- إزالة cache-busting من `handleDownloadPdf` (لم يعد ضرورياً بعد الـ Purge)
- أو الاحتفاظ به كاحتياط إضافي

```typescript
const handleDownloadPdf = () => {
  if (report?.generated_pdf_url) {
    // Cache-busting as extra safety (Purge should handle it)
    const cacheBuster = `?t=${Date.now()}`;
    window.open(report.generated_pdf_url + cacheBuster, "_blank");
  }
};
```

---

## ملخص الملفات

| الملف | النوع | الوصف |
|-------|-------|-------|
| `supabase/functions/generate-accident-pdf/index.ts` | تعديل | رابط ثابت + Purge API |
| `supabase/functions/save-accident-edits/index.ts` | تعديل | رابط ثابت + Purge API |
| `src/pages/AccidentReportForm.tsx` | تعديل طفيف | الاحتفاظ بـ cache-busting كاحتياط |

---

## النتيجة النهائية

1. **رابط البلاغ ثابت دائماً:**
   ```
   https://cdn.basheer-ab.com/accident-reports/{report_id}/report.html
   ```

2. **عند الحفظ من صفحة المعاينة:**
   - يُحدَّث نفس الملف
   - يُطلب Purge من CDN
   - التغييرات تظهر فوراً

3. **عند "إعادة الإنشاء":**
   - يُستبدل نفس الملف (لا ينشئ ملف جديد)
   - يُطلب Purge
   - التغييرات تظهر فوراً

4. **الرابط عام:**
   - لا يحتاج login
   - يمكن لأي شخص فتحه

---

## ملاحظة تقنية: Bunny Purge API

الـ Purge API يستخدم نفس الـ `BUNNY_API_KEY` الموجود:

```
POST https://api.bunny.net/purge?url=https://cdn.basheer-ab.com/accident-reports/{id}/report.html
Headers: AccessKey: {BUNNY_API_KEY}
```

هذا سيمسح الـ cache من جميع edge servers في Bunny ليظهر المحتوى الجديد فوراً.

