
# خطة: إصلاح مشكلة الـ Cache وتحسين آلية تحديث التقارير

## المشكلة المكتشفة

من logs الـ Edge Function:
```
CDN purge failed: {"Message":"Authorization has been denied for this request."}
```

**السبب:** Bunny CDN لديه مفتاحين مختلفين:
1. **Storage API Key** (موجود: `BUNNY_API_KEY`) → يعمل للرفع والحذف ✓
2. **Account API Key** (غير موجود) → مطلوب لـ Purge Cache ✗

لذلك عند الحفظ:
- ✅ الملف يُحدَّث على الـ Storage
- ❌ الـ Cache لا يُمسح
- ❌ الزائر يرى النسخة القديمة

---

## الحل: استراتيجية مزدوجة

### الحل الأول: إضافة مفتاح Bunny Account API (مطلوب)

يجب إضافة سر جديد:
- **الاسم:** `BUNNY_ACCOUNT_API_KEY`
- **القيمة:** من لوحة Bunny → Account → API Key

**ملاحظة:** هذا المفتاح مختلف عن Storage Password!

### الحل الثاني: تحسين منطق الـ Frontend (تطبيق فوري)

حتى لو فشل الـ Purge، سنجعل المعاينة تعمل بشكل أفضل:

1. **عند فتح المعاينة من CRM:** إعادة تحميل البيانات من قاعدة البيانات ثم عرضها
2. **إضافة زر "إعادة إنشاء HTML"** في صفحة AccidentReportForm
3. **تحسين رسالة "تم الحفظ"** لتوضيح أن المستخدم قد يحتاج للانتظار

---

## التعديلات المطلوبة

### 1) إضافة سر جديد: `BUNNY_ACCOUNT_API_KEY`

المستخدم يحتاج الحصول عليه من:
```
Bunny Dashboard → Account → API Key
```

### 2) تحديث Edge Functions لاستخدام المفتاح الصحيح

**ملف:** `supabase/functions/save-accident-edits/index.ts`
**ملف:** `supabase/functions/generate-accident-pdf/index.ts`
**ملف:** `supabase/functions/generate-correspondence-html/index.ts`

```typescript
// Purge API يحتاج مفتاح الحساب، ليس مفتاح الـ Storage
const bunnyAccountKey = Deno.env.get('BUNNY_ACCOUNT_API_KEY');
const bunnyStorageKey = Deno.env.get('BUNNY_API_KEY');

// للرفع: استخدم Storage Key
await fetch(uploadUrl, {
  headers: { 'AccessKey': bunnyStorageKey }
});

// للـ Purge: استخدم Account Key
if (bunnyAccountKey) {
  await fetch(purgeUrl, {
    headers: { 'AccessKey': bunnyAccountKey }
  });
}
```

### 3) تحسين Frontend: زر "إعادة إنشاء" مرئي

**ملف:** `src/pages/AccidentReportForm.tsx`

إضافة زر واضح بجانب "عرض التقرير":
- "إعادة إنشاء HTML" → يستدعي `generate-accident-pdf` مرة أخرى
- يضمن أن النسخة الجديدة تُنشأ وتُرفع

---

## ملخص الملفات

| الملف | النوع | الوصف |
|-------|-------|-------|
| `supabase/functions/save-accident-edits/index.ts` | تعديل | استخدام `BUNNY_ACCOUNT_API_KEY` للـ Purge |
| `supabase/functions/generate-accident-pdf/index.ts` | تعديل | استخدام `BUNNY_ACCOUNT_API_KEY` للـ Purge |
| `supabase/functions/generate-correspondence-html/index.ts` | تعديل | استخدام `BUNNY_ACCOUNT_API_KEY` للـ Purge |
| **Secret جديد** | إضافة | `BUNNY_ACCOUNT_API_KEY` من لوحة Bunny |

---

## كيفية الحصول على Bunny Account API Key

1. افتح https://panel.bunny.net
2. اذهب إلى **Account** (أعلى يمين)
3. انزل إلى قسم **API**
4. انسخ الـ **Account API Key**

⚠️ **ملاحظة:** هذا المفتاح مختلف عن "Storage Zone Password" الموجود في صفحة Storage!

---

## النتيجة بعد التطبيق

1. **عند الحفظ من صفحة المعاينة:**
   - ✅ الملف يُحدَّث على CDN
   - ✅ الـ Cache يُمسح فوراً
   - ✅ التغييرات تظهر للجميع

2. **عند فتح الرابط مرة أخرى:**
   - ✅ النسخة الجديدة تظهر بدون تأخير

---

## بديل مؤقت (بدون إضافة سر جديد)

إذا لم تريد إضافة المفتاح الآن، يمكن:
1. انتظار 1-2 دقيقة بعد الحفظ (الـ CDN يُحدِّث تلقائياً)
2. أو استخدام زر "إعادة إنشاء PDF" لإنشاء ملف جديد

لكن الحل الدائم هو إضافة `BUNNY_ACCOUNT_API_KEY`.
