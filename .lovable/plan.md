

# إصلاح مشكلة "فشل إرسال الطلب إلى Edge Function"

## المشكلة المكتشفة

عند النقر على زر "إرسال" في نافذة الرسائل الجماعية، يظهر خطأ:
```
خطأ - Failed to send a request to the Edge Function
```

### تحليل السجلات:
```
OPTIONS | 404 | send-bulk-debt-sms
OPTIONS | 404 | send-manual-reminder
```

**السبب الجذري:**  
الـ Edge Functions موجودة في الكود (`supabase/functions/`) ومُعرَّفة في `config.toml`، لكنها **غير منشورة (not deployed)** على الخادم.

---

## الحل

### نشر الـ Edge Functions المفقودة

الـ Functions التي تحتاج للنشر:
1. `send-bulk-debt-sms` - لإرسال الرسائل الجماعية
2. `send-manual-reminder` - لإرسال تذكير فردي للعميل

**لا يوجد تغييرات في الكود** - فقط يجب نشر الـ Functions الموجودة.

---

## الملفات الموجودة (لا تحتاج تعديل)

| الملف | الحالة |
|-------|--------|
| `supabase/functions/send-bulk-debt-sms/index.ts` | موجود ✓ |
| `supabase/functions/send-manual-reminder/index.ts` | موجود ✓ |
| `supabase/config.toml` | مُعرَّف ✓ |

---

## النتيجة المتوقعة بعد النشر

- زر "إرسال" في الرسائل الجماعية يعمل
- زر "تذكير" للعميل الفردي يعمل
- لا مزيد من خطأ 404

---

## التفاصيل التقنية

الـ Functions تستخدم:
- `verify_jwt = true` - تتطلب مصادقة المستخدم
- تتصل بـ `sms_settings` للحصول على بيانات الـ SMS
- تستخدم RPC `report_client_debts` و `get_client_balance` للحصول على بيانات الديون

