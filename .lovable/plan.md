
# إصلاح مشكلة رابط صور الشيكات - بادئة https:// مفقودة

## المشكلة الجذرية

متغير البيئة `BUNNY_CDN_URL` مضبوط على:
```
basheer-ab.b-cdn.net
```
بدلاً من:
```
https://basheer-ab.b-cdn.net
```

لذلك الـ URL الناتج يكون:
```html
<img src="basheer-ab.b-cdn.net/cheques/scan_xxx.jpg">  ❌ لا يعمل
```
بدلاً من:
```html
<img src="https://basheer-ab.b-cdn.net/cheques/scan_xxx.jpg">  ✅ يعمل
```

---

## الحل

### تعديل ملف واحد: `supabase/functions/process-cheque-scan/index.ts`

**السطر 166** - إضافة فحص وإصلاح تلقائي للـ URL:

```typescript
// قبل
const cdnUrl = `${BUNNY_CDN_URL}/${uploadPath}`;

// بعد
let cdnBase = BUNNY_CDN_URL;
// إضافة https:// إذا كانت مفقودة
if (!cdnBase.startsWith('http://') && !cdnBase.startsWith('https://')) {
  cdnBase = `https://${cdnBase}`;
}
const cdnUrl = `${cdnBase}/${uploadPath}`;
```

هذا الحل:
- يتحقق إذا كان الـ URL يبدأ بـ `http://` أو `https://`
- إذا لا، يضيف `https://` تلقائياً
- يعمل بغض النظر عن كيفية ضبط متغير البيئة

---

## ملخص التغييرات

| الملف | التغيير |
|-------|---------|
| `process-cheque-scan/index.ts` | إضافة فحص وإصلاح تلقائي لبادئة https:// |

---

## النتيجة المتوقعة

بعد التنفيذ، صور الشيكات ستظهر بشكل صحيح لأن الـ URL سيكون:
```
https://basheer-ab.b-cdn.net/cheques/scan_xxx.jpg
```
