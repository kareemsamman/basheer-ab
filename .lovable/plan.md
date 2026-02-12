

# إصلاح ربط ריווחית - المشاكل الحقيقية

## المشاكل المكتشفة من توثيق الـ API

### 1. نوع المستند خاطئ
نستخدم `document_type: 4` (חשבון עסקה) بينما المطلوب `document_type: 1` (חשבונית מס)

### 2. `id_number` يجب أن يكون رقم (integer) وليس نص (string)
حسب توثيق الـ API: `id_number: integer | null` - نحن نرسله كـ string مثل `"123456789"` بدل `123456789`. هذا يسبب رفض الطلب.

### 3. إعدادات مفقودة مهمة
- `validate_id: false` - لمنع رفض المستند بسبب أرقام هوية بصيغة خاطئة
- `send_mail: false` - لمنع إرسال بريد إلكتروني لكل عميل تلقائيا

## الحل

### تعديل: `supabase/functions/send-to-rivhit/index.ts`

| تغيير | قبل | بعد |
|--------|------|------|
| نوع المستند | `document_type = 4` | `document_type = 1` (חשבונית מס) |
| رقم الهوية | `id_number: row.idNumber` (string) | `id_number: parseInt(row.idNumber) او 0` (integer) |
| فحص الهوية | غير موجود | `validate_id: false` |
| إرسال بريد | غير موجود | `send_mail: false` |

### تعديل: `supabase/functions/generate-tax-invoice/index.ts`

- تغيير `document_type` الافتراضي في JS المضمن بالـ HTML من 4 إلى 1

### التغييرات التقنية في الـ payload

```text
const payload = {
  api_token: rivhitToken,
  document_type: 1,           // חשבונית מס (كان 4)
  customer_id: 0,
  last_name: row.clientName || "-",
  id_number: parseInt(row.idNumber) || 0,  // integer (كان string)
  phone: row.phone || "",
  create_customer: true,
  find_by_id: true,
  validate_id: false,         // جديد - لا ترفض هوية بصيغة خاطئة
  send_mail: false,           // جديد - لا ترسل بريد
  price_include_vat: false,
  items: [{
    description: row.insuranceType || "عمولة تأمين",
    price_nis: row.profit,
    quantity: 1,
  }],
};
```

| ملف | تغيير |
|------|--------|
| `supabase/functions/send-to-rivhit/index.ts` | document_type=1 + id_number integer + validate_id + send_mail |
| `supabase/functions/generate-tax-invoice/index.ts` | document_type=1 في JS |

