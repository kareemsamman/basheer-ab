
# خطة التحويل إلى OpenRouter API

## ملخص التغييرات

سأقوم بتحويل Edge Function لمسح الشيكات من Lovable AI إلى OpenRouter API باستخدام مفتاح API الخاص بك.

---

## الخطوة 1: تخزين مفتاح API بشكل آمن

سأستخدم أداة إضافة السر لتخزين المفتاح:
- **اسم السر**: `OPENROUTER_API_KEY`
- **القيمة**: المفتاح الذي أرسلته

---

## الخطوة 2: تحديث Edge Function

### الملف: `supabase/functions/process-cheque-scan/index.ts`

**التغيير 1**: استبدال المفتاح (السطر 221-224)

```typescript
// قبل
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
if (!LOVABLE_API_KEY) {
  throw new Error("LOVABLE_API_KEY is not configured");
}

// بعد
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
if (!OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not configured");
}
```

**التغيير 2**: استبدال URL و Headers (السطر 251-274)

```typescript
// قبل
const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    ...
  }),
});

// بعد
const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://basheer-ab.lovable.app",
    "X-Title": "AB Insurance CRM - Cheque Scanner",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",  // نفس الموديل متاح على OpenRouter
    ...
  }),
});
```

**التغيير 3**: تحديث رسائل الخطأ (السطر 323-331)

```typescript
// تغيير رسالة نفاد الاعتمادات
if (paymentError) {
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: "payment_required",
      message: "نفد رصيد OpenRouter. يرجى شحن الحساب." 
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

---

## ملخص التغييرات

| البند | قبل | بعد |
|-------|-----|-----|
| المفتاح | `LOVABLE_API_KEY` | `OPENROUTER_API_KEY` |
| الـ URL | `ai.gateway.lovable.dev` | `openrouter.ai/api` |
| الموديل | `google/gemini-2.5-flash` | `google/gemini-2.5-flash` (نفسه) |
| Headers | Authorization فقط | + HTTP-Referer + X-Title |

---

## تفاصيل تقنية

### لماذا نفس الموديل؟
OpenRouter يدعم نفس موديلات Google Gemini، لذا لا حاجة لتغيير الموديل.

### التكلفة على OpenRouter
- `google/gemini-2.5-flash`: ~$0.10 لكل مليون token (input)
- تحليل شيك واحد ≈ 1000-2000 tokens
- **التكلفة التقريبية**: ~$0.0002 لكل شيك (أقل من قرش)

### الـ Headers الإضافية
- `HTTP-Referer`: مطلوب من OpenRouter لتتبع الاستخدام
- `X-Title`: اسم التطبيق للعرض في لوحة التحكم

---

## ملاحظة أمنية

⚠️ **يُنصح بتغيير مفتاح OpenRouter** من لوحة التحكم بعد التنفيذ لأنه ظهر في الدردشة.

الرابط: https://openrouter.ai/settings/keys
