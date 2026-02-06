
# خطة إصلاح زر إرسال SMS الجماعي في صفحة متابعة الديون

## المشكلة
زر "إرسال للكل" في صفحة متابعة الديون لا يرسل الرسائل - يعرض "تم إرسال 0 رسالة بنجاح (فشل 1)"

## السبب
من خلال فحص logs الـ Edge Function، وجدت أن:
- الـ API يُرجع صفحة HTML كاملة بدلاً من استجابة نجاح
- السبب: استخدام **تنسيق API خاطئ** للـ 019sms

### التنسيق الخاطئ (المستخدم حالياً):
```javascript
// GET request مع query parameters - هذا خاطئ!
const smsUrl = `https://019sms.co.il/api?send=1&user=...&password=...&sender=...&recipient=...&message=...`;
const response = await fetch(smsUrl);
```

### التنسيق الصحيح (المستخدم في باقي الـ functions):
```javascript
// POST request مع XML body و Bearer token
const smsXml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user><username>${sms_user}</username></user>
  <source>${sms_source}</source>
  <destinations><phone id="${dlr}">${cleanPhone}</phone></destinations>
  <message>${message}</message>
</sms>`;

fetch('https://019sms.co.il/api', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${sms_token}`,
    'Content-Type': 'application/xml; charset=utf-8',
  },
  body: smsXml,
});
```

---

## الحل
تحديث `supabase/functions/send-bulk-debt-sms/index.ts` لاستخدام نفس تنسيق API المستخدم في:
- `send-sms/index.ts`
- `send-manual-reminder/index.ts`

---

## التغييرات المطلوبة

### تحديث `send-bulk-debt-sms/index.ts`:

1. **إضافة دالة `escapeXml`** للتعامل مع الأحرف الخاصة في XML

2. **تغيير تنظيف رقم الهاتف** ليطابق باقي الـ functions:
```javascript
let cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
if (cleanPhone.startsWith("972")) {
  cleanPhone = "0" + cleanPhone.substring(3);
}
```

3. **تغيير طريقة إرسال SMS** من GET إلى POST مع XML:
```javascript
const dlr = crypto.randomUUID();
const smsXml =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<sms>` +
  `<user><username>${escapeXml(smsUser)}</username></user>` +
  `<source>${escapeXml(smsSource)}</source>` +
  `<destinations><phone id="${dlr}">${escapeXml(cleanPhone)}</phone></destinations>` +
  `<message>${escapeXml(message)}</message>` +
  `</sms>`;

const smsResponse = await fetch("https://019sms.co.il/api", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${smsToken}`,
    "Content-Type": "application/xml; charset=utf-8",
  },
  body: smsXml,
});
```

4. **تحديث فحص النجاح** من `includes("OK")` إلى فحص XML status:
```javascript
const extractTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
};

const status = extractTag(smsResult, "status");
const isSuccess = status === "0";
```

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `supabase/functions/send-bulk-debt-sms/index.ts` | تعديل - إصلاح تنسيق API |

---

## النتيجة المتوقعة
- رسائل SMS ستُرسل بنجاح لجميع العملاء المختارين
- Toast سيعرض عدد الرسائل المُرسلة الفعلي
- سجلات SMS ستُحفظ بشكل صحيح في `sms_logs`
