
# خطة: إصلاح فتح رابط الفاتورة عند الطباعة

## المشكلة

عند الضغط على "طباعة الفاتورة"، لا يتم فتح الرابط في نافذة جديدة لأن:
1. الـ Edge Function للباقات (`send-package-invoice-sms`) يُرجع: `package_invoice_url`
2. الـ Edge Function للوثيقة المفردة (`send-invoice-sms`) يُرجع: `ab_invoice_url`
3. الكود في `InvoiceSendPrintDialog.tsx` يبحث فقط عن: `ab_invoice_url` أو `invoice_url`

**النتيجة**: الرابط `package_invoice_url` لا يُقرأ → يظهر toast فارغ

## الحل

تعديل السطر 96 في `InvoiceSendPrintDialog.tsx` ليشمل جميع أسماء الروابط الممكنة:

```typescript
// قبل:
const invoiceUrl = data?.ab_invoice_url || data?.invoice_url;

// بعد:
const invoiceUrl = data?.ab_invoice_url || data?.package_invoice_url || data?.invoice_url;
```

## الملف المتأثر

| الملف | التغيير |
|-------|---------|
| `src/components/policies/InvoiceSendPrintDialog.tsx` | إضافة `package_invoice_url` للبحث |

## التغيير التفصيلي

**السطر 96:**
```typescript
const invoiceUrl = data?.ab_invoice_url || data?.package_invoice_url || data?.invoice_url;
```

هذا يضمن أن:
- للوثيقة المفردة → يستخدم `ab_invoice_url`
- للباقة → يستخدم `package_invoice_url`
- كخيار احتياطي → `invoice_url`

## النتيجة المتوقعة

عند الضغط على "طباعة الفاتورة":
1. يستدعي الـ Edge Function مع `skip_sms: true`
2. يحصل على رابط الفاتورة (سواء `ab_invoice_url` أو `package_invoice_url`)
3. يفتح الرابط في نافذة جديدة `window.open(invoiceUrl, "_blank")`
4. يُظهر toast نجاح "تم فتح الفاتورة في نافذة جديدة"
