
# خطة: إصلاح مشكلة حظر رابط الواتساب

## المشكلة
رابط الواتساب يُحظر عند النقر عليه من داخل الموقع بسبب:
1. `window.open()` يمكن أن يُحظر من قبل متصفحات حديثة كـ "popup"
2. عند التشغيل داخل iframe (مثل معاينة Lovable)، الروابط الخارجية قد تُحظر

## الحل
استخدام عنصر `<a>` مع `target="_blank"` بدلاً من `window.open()`:
- إنشاء رابط anchor ديناميكياً
- محاكاة النقر عليه
- هذا يتجاوز حماية popup blocker

## التغييرات المطلوبة

### ملف: `src/pages/DebtTracking.tsx`

**الكود الحالي:**
```tsx
const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
window.open(whatsappUrl, '_blank');
```

**الكود الجديد:**
```tsx
const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

// إنشاء رابط anchor وهمي للتجاوز popup blocker
const link = document.createElement('a');
link.href = whatsappUrl;
link.target = '_blank';
link.rel = 'noopener noreferrer';
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
```

## لماذا هذا الحل يعمل؟
- المتصفحات تثق بالنقر على عناصر `<a>` أكثر من `window.open()`
- إضافة `rel="noopener noreferrer"` للأمان
- الرابط يُزال فوراً بعد النقر

---

## ملخص الملفات

| الملف | التغيير |
|-------|---------|
| `src/pages/DebtTracking.tsx` | تغيير طريقة فتح الرابط من `window.open` إلى anchor click |
