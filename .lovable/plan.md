

# إصلاح ربط ריווחית (Rivhit API)

## المشكلة
110 عملية فشلت لأن:
1. الـ API يرجع XML بشكل افتراضي، والكود يحاول يقرأه كـ JSON - لذلك ظهر خطأ `<?xml vers...`
2. اسم حقل السعر خاطئ: استخدمنا `price` بينما الـ API يتوقع `price_nis`
3. لم نرسل `customer_id: 0` المطلوب لتفعيل إنشاء عميل جديد تلقائيا

العمليتان اللتان "نجحتا" كانتا في الحقيقة أسطر بمربح = 0 تم تخطيها (لم ترسل لריווحيت أصلا).

## الحل

### تعديل: `supabase/functions/send-to-rivhit/index.ts`

1. إضافة header `Accept: application/json` في طلب الـ fetch لإجبار الـ API على الرد بـ JSON
2. تغيير `price` الى `price_nis` في مصفوفة items
3. إضافة `customer_id: 0` في الـ payload لتفعيل آلية إنشاء/بحث عن عميل
4. إضافة logging للـ response الخام قبل محاولة parse كـ JSON للتشخيص
5. التعامل مع حالة رد XML كـ fallback (في حال بقي XML)

### التغييرات التقنية

```text
قبل:
headers: { "Content-Type": "application/json" }
items: [{ description, price, quantity }]

بعد:
headers: { 
  "Content-Type": "application/json",
  "Accept": "application/json" 
}
items: [{ description, price_nis, quantity }]
customer_id: 0
```

| ملف | تغيير |
|------|--------|
| `supabase/functions/send-to-rivhit/index.ts` | إصلاح headers + price_nis + customer_id: 0 + logging |

