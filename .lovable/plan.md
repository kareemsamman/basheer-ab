
# ربط الفاتورة الضريبية مع ريووحيت (Rivhit)

## الفكرة
إضافة زر "שלח לריווחית" (إرسال إلى ريووحيت) في صفحة الفاتورة الضريبية HTML. عند الضغط عليه، يتم إنشاء עסקה (مستند/تعاملة) في نظام ריווחית لكل سطر في الفاتورة، بحيث تظهر في דוח תנועות.

## كيف يعمل

1. حفظ مفتاح API الخاص بريووحيت كـ secret في المشروع
2. إنشاء Edge Function جديدة `send-to-rivhit` تستقبل بيانات الفاتورة وترسل كل سطر كـ Document.New إلى Rivhit API
3. تعديل `generate-tax-invoice` لإضافة زر "שלח לריווחית" في HTML مع JavaScript يستدعي الـ Edge Function
4. كل سطر (عميل) = مستند منفصل في ריווחית مع تفاصيل البوليصة

## تفاصيل كل עסקה في ריווחית

لكل سطر في الفاتورة سيتم إنشاء مستند من نوع 4 (סותר/מכירות/של"ט) يحتوي على:
- **last_name**: اسم العميل
- **id_number**: رقم الهوية
- **phone**: رقم الهاتف
- **items**: فريط واحد بالوصف (نوع التأمين) والمبلغ (المربح/العمولة)
- **price_include_vat**: false (المبلغ بدون ضريبة)
- **create_customer**: true (إنشاء كرطيس لقوח تلقائي إن لم يكن موجود)
- **find_by_id**: true (البحث عن العميل بالهوية أولا)

## التفاصيل التقنية

### Secret جديد
- `RIVHIT_API_TOKEN` = `EC24D242-FF86-4D3D-8DC3-4209CE685001`

### ملف جديد: `supabase/functions/send-to-rivhit/index.ts`

**المدخلات:**
```typescript
{
  rows: Array<{
    clientName: string;
    phone: string;
    idNumber: string;
    insuranceType: string;
    fullAmount: number;
    profit: number;
  }>;
  document_type: number; // default 4
}
```

**المنطق:**
- لكل سطر: يستدعي `https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/Document.New`
- يرسل POST مع JSON body يحتوي على api_token, document_type, last_name, id_number, phone, وitem واحد بوصف نوع التأمين ومبلغ المربح
- يجمع النتائج (نجاح/فشل) ويرجعها

### تعديل: `supabase/functions/generate-tax-invoice/index.ts`

**الإضافات في HTML:**
- زر "שלח לריווחית" بجانب زر الطباعة
- JavaScript يرسل بيانات الصفوف إلى Edge Function `send-to-rivhit`
- عرض حالة الإرسال (جاري، نجح، فشل) لكل سطر
- بعد النجاح يمكن الطباعة مباشرة

**البيانات تُضمن في HTML كـ JSON مخفي:**
```html
<script>
  const INVOICE_DATA = { rows: [...], supabaseUrl: "..." };
</script>
```

### الملفات المتأثرة

| ملف | تغيير |
|------|--------|
| `supabase/functions/send-to-rivhit/index.ts` | Edge Function جديدة لإرسال العسقاوات لريووحيت |
| `supabase/functions/generate-tax-invoice/index.ts` | إضافة زر שלח לריווחית + JS في HTML |

