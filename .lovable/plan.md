
# خطة تسريع مسح الشيكات وإصلاح Timeout

## المشكلة المكتشفة

### تحليل السجلات الفعلية:
```
12:17:33 → 12:18:23 = صورة 1 (50 ثانية)
12:18:23 → 12:19:40 = صورة 2 (77 ثانية)  
12:19:40 → timeout!  = صورة 3 (لم تكتمل)
```

**السبب الجذري:**
- `google/gemini-3-pro-preview` بطيء جداً للصور الكبيرة (~50-80 ثانية/صورة)
- 3 صور = ~3-4 دقائق (يتجاوز مهلة Edge Function 150 ثانية)
- المعالجة التسلسلية تضاعف المشكلة

---

## الحل المقترح: نهج ثلاثي الأبعاد

### 1. استخدام نموذج أسرع: `gemini-2.5-flash`

| النموذج | وقت التحليل/صورة | الدقة |
|---------|-----------------|-------|
| gemini-3-pro-preview | 50-80 ثانية ❌ | عالية جداً |
| **gemini-2.5-flash** | **5-10 ثانية** ✅ | عالية |

`gemini-2.5-flash` أسرع 10x مع دقة ممتازة للـ OCR.

---

### 2. المعالجة المتوازية (Parallel Processing)

```typescript
// قبل: تسلسلي (3 صور × 50 ثانية = 150+ ثانية)
for (const image of images) {
  await processImage(image);
}

// بعد: متوازي (3 صور في نفس الوقت = ~10-15 ثانية)
await Promise.all(images.map(image => processImage(image)));
```

---

### 3. تحديث تقدير الوقت في الواجهة

```typescript
// تقدير محدث مع gemini-2.5-flash + parallel
const estimatedSecondsPerImage = 5; // بدلاً من 12
const totalEstimated = Math.max(10, scannedImages.length * 5);
```

**التقديرات الجديدة:**
| عدد الصور | الوقت (المتوازي) |
|-----------|-----------------|
| 1 صورة | ~5-10 ثوان |
| 3 صور | ~10-15 ثانية |
| 5 صور | ~10-20 ثانية |
| 10 صور | ~15-30 ثانية |

---

## التغييرات التقنية

### ملف 1: `supabase/functions/process-cheque-scan/index.ts`

**أ) تغيير النموذج:**
```typescript
// من
model: "google/gemini-3-pro-preview"

// إلى
model: "google/gemini-2.5-flash"
```

**ب) المعالجة المتوازية:**
```typescript
// معالجة جميع الصور بالتوازي
const imageResults = await Promise.all(
  images.map(async (image, imgIndex) => {
    // ... AI call for each image
  })
);

// تجميع النتائج
for (const result of imageResults) {
  allDetectedCheques.push(...result.cheques);
}
```

---

### ملف 2: `src/components/payments/ChequeScannerDialog.tsx`

**تحديث تقدير الوقت:**
```typescript
// من
const estimatedSecondsPerImage = 12;

// إلى
const estimatedSecondsPerImage = 5; // مع gemini-2.5-flash + parallel
```

---

## الملخص

| الجانب | قبل | بعد |
|--------|-----|-----|
| النموذج | gemini-3-pro-preview | gemini-2.5-flash |
| المعالجة | تسلسلية | متوازية |
| 3 صور | ~3-4 دقائق + timeout | ~10-15 ثانية |
| حد الوقت | يتجاوز 150 ثانية | ضمن الحد بأمان |
| الدقة | عالية جداً | عالية (كافية للـ OCR) |

---

## ملاحظة تقنية مهمة

`gemini-2.5-flash` ليس أقل دقة في OCR - فهو مُحسَّن خصيصاً للمهام البصرية السريعة. الفرق الرئيسي هو في المهام "التفكيرية" المعقدة، وليس قراءة النص من الصور.
