
# إصلاح مسح الشيكات - معالجة خطأ الاعتمادات وإلغاء القص

## المشاكل المكتشفة

### 1. خطأ 402 - نفاد الاعتمادات
```
AI API error for image 1: 402 {"type":"payment_required","message":"Not enough credits"}
```
الـ Edge Function يُرجع الخطأ بشكل صحيح، لكن الـ Frontend يعرض رسالة عامة بدلاً من الرسالة الفعلية.

### 2. منطق قص الصور الحالي
النظام الحالي يقوم بقص كل شيك من الصورة الأصلية، مما قد يُنتج صوراً متطابقة أو يضر بالجودة.

---

## الحل المقترح

### الجزء 1: تحسين عرض الأخطاء في الـ Frontend

**الملف:** `src/components/payments/ChequeScannerDialog.tsx`

```tsx
// السطر 505-515 تقريباً
const { data, error: fnError } = await supabase.functions.invoke('process-cheque-scan', {
  body: { images: base64Images }
});

// تحسين معالجة الأخطاء
if (fnError) {
  // معالجة أخطاء محددة
  if (fnError.message?.includes('402') || fnError.message?.includes('credits')) {
    throw new Error('نفدت اعتمادات AI. يرجى إضافة رصيد للمتابعة.');
  }
  if (fnError.message?.includes('429') || fnError.message?.includes('rate')) {
    throw new Error('تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً.');
  }
  throw new Error(fnError.message);
}
```

### الجزء 2: إلغاء القص - استخدام الصورة الكاملة

**الملف:** `supabase/functions/process-cheque-scan/index.ts`

التغييرات:
1. استخدام نموذج `gemini-2.5-flash` بدلاً من `gemini-2.5-pro` (أسرع وأرخص)
2. إلغاء إرسال `bounding_box` و `cropped_base64`
3. رفع الصورة الأصلية الكاملة **مرة واحدة** لكل صورة ممسوحة
4. كل الشيكات المكتشفة في نفس الصورة تشترك في نفس `image_url`

```typescript
// تبسيط المنطق: رفع الصورة الأصلية مرة واحدة
for (const result of imageResults) {
  // رفع الصورة الأصلية مرة واحدة فقط
  const fileName = `scan_${Date.now()}_${result.imgIndex}.jpg`;
  const cdnUrl = await uploadToBunny(result.imageBase64, fileName);
  
  // كل الشيكات في هذه الصورة تستخدم نفس الـ URL
  for (const cheque of result.cheques) {
    cheque.image_url = cdnUrl || `data:image/jpeg;base64,${result.imageBase64}`;
    // لا نرسل cropped_base64 أو bounding_box للـ client
    delete cheque.cropped_base64;
    allDetectedCheques.push(cheque);
  }
}
```

### الجزء 3: تبسيط معالجة الـ Client

**الملف:** `src/components/payments/ChequeScannerDialog.tsx`

إزالة منطق القص والتدوير - استخدام `image_url` مباشرة:

```tsx
// السطر 517-564 - تبسيط
const rawCheques = data.cheques || [];
const processedCheques: DetectedCheque[] = rawCheques.map(c => ({
  ...c,
  isEditing: false,
  isConfirmed: false,
}));

setDetectedCheques(processedCheques);
```

---

## ملخص التغييرات

| الملف | التغيير |
|-------|---------|
| `process-cheque-scan/index.ts` | استخدام `gemini-2.5-flash`، رفع الصورة الكاملة مرة واحدة، إزالة `cropped_base64` |
| `ChequeScannerDialog.tsx` | تحسين عرض الأخطاء، إزالة منطق القص، استخدام `image_url` مباشرة |

---

## النتيجة المتوقعة

### قبل:
- كل شيك له صورة مقصوصة منفصلة
- رسالة خطأ عامة عند نفاد الاعتمادات
- نموذج `gemini-2.5-pro` (مكلف)

### بعد:
- كل الشيكات في نفس الصورة تشترك في الصورة الأصلية الكاملة (جودة عالية)
- رسائل خطأ واضحة بالعربية
- نموذج `gemini-2.5-flash` (أسرع وأرخص)

---

## ملاحظة هامة

**خطأ نفاد الاعتمادات** يحتاج إلى إضافة رصيد في حساب Lovable:
Settings → Workspace → Usage → Add Credits

لكن الإصلاحات أعلاه ستضمن:
1. عرض رسالة واضحة للمستخدم
2. تقليل استهلاك الاعتمادات باستخدام نموذج أرخص
3. عدم هدر الاعتمادات على رفع صور متعددة
