
# إصلاح مشكلة "Edge Function returned a non-2xx status code"

## المشكلة الجذرية

عندما يُرجع الـ Edge Function كود HTTP غير 200 (مثل 402 أو 429)، مكتبة Supabase تلتقط الخطأ وتظهر رسالة عامة:

```
"Edge Function returned a non-2xx status code"
```

**المشكلة**: الـ response body الذي يحتوي على الرسالة المفصلة لا يُمرر للـ `error.message` - إنما يُخزن في `error.context` الذي لا يُقرأ بسهولة.

## الحل

**تغيير منطق الـ Edge Function**: إرجاع HTTP 200 دائماً، مع تضمين حالة الخطأ في الـ JSON body.

---

## التغييرات المطلوبة

### الملف: `supabase/functions/process-cheque-scan/index.ts`

**التغيير 1**: عند خطأ rate limit (السطر 312-316)

```typescript
// قبل
if (rateLimitError) {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded..." }),
    { status: 429, headers: {...} }  // ❌ هذا يسبب المشكلة
  );
}

// بعد
if (rateLimitError) {
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: "rate_limit",
      message: "تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً." 
    }),
    { status: 200, headers: {...} }  // ✅ نرجع 200 مع error في الـ body
  );
}
```

**التغيير 2**: عند خطأ نفاد الاعتمادات (السطر 318-324)

```typescript
// قبل
if (paymentError) {
  return new Response(
    JSON.stringify({ error: "AI credits exhausted..." }),
    { status: 402, headers: {...} }  // ❌ هذا يسبب المشكلة
  );
}

// بعد
if (paymentError) {
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: "payment_required",
      message: "نفدت اعتمادات AI. يرجى إضافة رصيد للمتابعة." 
    }),
    { status: 200, headers: {...} }  // ✅ نرجع 200 مع error في الـ body
  );
}
```

**التغيير 3**: عند خطأ عام (السطر 373-380)

```typescript
// بعد
} catch (error) {
  console.error("Error in process-cheque-scan:", error);
  return new Response(
    JSON.stringify({ 
      success: false,
      error: "server_error",
      message: error instanceof Error ? error.message : "خطأ غير متوقع" 
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

---

### الملف: `src/components/payments/ChequeScannerDialog.tsx`

**تبسيط معالجة الأخطاء** (السطر 509-531):

```typescript
const { data, error: fnError } = await supabase.functions.invoke('process-cheque-scan', {
  body: { images: base64Images }
});

// Network/connection error (no response at all)
if (fnError) {
  throw new Error('خطأ في الاتصال بالخادم. تحقق من الإنترنت.');
}

// Server returned error in body (new pattern)
if (data?.error) {
  // Specific error messages based on error type
  if (data.error === 'payment_required') {
    throw new Error(data.message || 'نفدت اعتمادات AI. يرجى إضافة رصيد للمتابعة.');
  }
  if (data.error === 'rate_limit') {
    throw new Error(data.message || 'تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً.');
  }
  throw new Error(data.message || 'خطأ في معالجة الشيكات');
}

if (!data?.success) {
  throw new Error('فشل في معالجة الصور');
}
```

---

## ملخص التغييرات

| الملف | التغيير |
|-------|---------|
| `process-cheque-scan/index.ts` | إرجاع HTTP 200 دائماً + تضمين نوع الخطأ والرسالة في JSON |
| `ChequeScannerDialog.tsx` | قراءة `data.error` و `data.message` بدل `fnError.message` |

---

## النتيجة المتوقعة

| قبل | بعد |
|-----|-----|
| "Edge Function returned a non-2xx status code" | "نفدت اعتمادات AI. يرجى إضافة رصيد للمتابعة." |

---

## لماذا هذا الحل صحيح؟

1. **مشكلة معروفة في Supabase SDK**: عند HTTP غير 200، الـ response body يُهمل
2. **الحل المعتمد**: إرجاع 200 OK مع `success: false` في الـ body
3. **أفضل ممارسة**: تضمين `error` (نوع) + `message` (رسالة للمستخدم)

---

## ملاحظة عن الاعتمادات

الخطأ الفعلي هو **نفاد اعتمادات Lovable AI**.

**الحل**: إضافة رصيد من Settings → Workspace → Usage

لكن هذا الإصلاح سيضمن ظهور **رسالة واضحة بالعربية** بدلاً من الرسالة التقنية.
