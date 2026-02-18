

# مزامنة كاملة بين AB و X-Service + فواتير الخدمات

## الوضع الحالي

AB يرسل حالياً إلى X-Service عبر 3 endpoints:
- `ab-sync-receive` — إنشاء وثيقة جديدة (create)
- `ab-sync-update` — حذف / إلغاء / تحويل (delete/cancel/transfer)

**ما ينقص:**
1. عند **تعديل** وثيقة خدمة في AB (سعر، تواريخ، اسم عميل، سيارة...) لا يتم إبلاغ X
2. عند إنشاء **باكيج** فيه وثيقة خدمة، لا يتم إرسالها تلقائياً
3. لا يوجد طريقة لجلب **فاتورة** من X-Service وعرضها في AB

---

## الخطة — تغييرات في AB (هذا المشروع)

### 1. إرسال "update" عند تعديل وثيقة خدمة
في ملف `PolicyEditDrawer.tsx`، بعد نجاح حفظ الوثيقة (سطر 334)، نضيف استدعاء `notify-xservice-change` بـ action = "update" إذا كانت الوثيقة من نوع `ROAD_SERVICE` أو `ACCIDENT_FEE_EXEMPTION`.

### 2. توسيع `notify-xservice-change` لدعم action = "update"
حالياً الدالة تدعم cancel/delete/transfer فقط. نضيف "update" كـ action مدعوم — نفس المنطق (جلب بيانات العميل والسيارة والوثيقة وإرسالها).

### 3. إرسال وثائق الخدمة تلقائياً عند إنشاء باكيج
في wizard الباكيج (بعد إنشاء الوثائق بنجاح)، نتحقق إذا كان أحد مكونات الباكيج من نوع خدمة → نستدعي `sync-to-xservice` لها تلقائياً.

### 4. جلب وعرض فاتورة X-Service
- نضيف عمود `xservice_invoice_url` في جدول `policies` (أو نستخدم الـ `xservice_policy_id` الموجود في sync_log)
- ننشئ دالة `get-xservice-invoice` في AB تتصل بـ X-Service API لجلب رابط الفاتورة
- نضيف زر "فاتورة X" في تفاصيل الوثيقة يفتح الفاتورة في iframe أو tab جديد
- الرابط يكون بالشكل: `https://x-service-domain/invoice/{policy_id_in_x}`

---

## ما تكتبه لـ Lovable في مشروع X-Service

انسخ هذا النص وأرسله في X-Service Lovable:

---

**أنشئ endpoint جديد `ab-sync-update` يستقبل تحديثات من نظام AB الخارجي. الـ endpoint يستقبل POST بالشكل التالي:**

```
{
  "api_key": "string",           // مفتاح التحقق — تحقق منه مقابل agent_api_keys
  "action": "cancel" | "delete" | "transfer" | "update",
  "customer": {
    "full_name": "string",
    "id_number": "string",
    "phone1": "string"
  },
  "car": {
    "car_number": "string",
    "car_type": "string | null",
    "manufacturer": "string",
    "model": "string",
    "year": "number | null",
    "color": "string"
  },
  "policy": {
    "service_type": "road_service" | "accident_fee",
    "policy_number": "string | null",
    "start_date": "string",
    "end_date": "string",
    "sell_price": "number",       // السعر الذي يدفعه الوكيل (AB) — هذا هو سعر البيع من منظور X
    "notes": "string"
  },
  "transfer_to_car": {           // فقط عند action = "transfer"
    "car_number": "string",
    "manufacturer": "string",
    "model": "string",
    "year": "number | null",
    "color": "string"
  }
}
```

**المنطق المطلوب لكل action:**

1. **"update"** — ابحث عن الوثيقة الموجودة بناءً على `customer.id_number` + `car.car_number` + `policy.service_type` + `policy.start_date` (أو policy_number إذا موجود). حدّث كل البيانات: اسم العميل، بيانات السيارة، التواريخ، السعر، الملاحظات. إذا تغيرت السيارة حدّث بيانات السيارة أيضاً. إذا لم تُوجد الوثيقة، أنشئها (upsert).

2. **"cancel"** — ابحث عن الوثيقة وضع حالتها كملغاة (cancelled = true). لا تحذفها.

3. **"delete"** — ابحث عن الوثيقة واحذفها (أو ضع deleted_at).

4. **"transfer"** — ابحث عن الوثيقة، حدّث السيارة المرتبطة بها إلى بيانات `transfer_to_car`. إذا السيارة الجديدة غير موجودة أنشئها.

**أيضاً أنشئ endpoint `ab-get-invoice` يستقبل:**
```
{
  "api_key": "string",
  "customer_id_number": "string",
  "car_number": "string",
  "service_type": "road_service" | "accident_fee",
  "start_date": "string"
}
```

**ويرجع:**
```
{
  "invoice_url": "https://x-service.../invoice/{id}",
  "invoice_id": "uuid",
  "exists": true/false
}
```

هذا يسمح لنظام AB بجلب رابط الفاتورة وعرضها للمستخدم.

**مهم:** تحقق من `api_key` في كل request مقابل جدول `agent_api_keys`. إذا غير صحيح ارجع 401.

---

## القسم التقني — تفاصيل تغييرات AB

### الملفات المعدلة:
1. **`supabase/functions/notify-xservice-change/index.ts`** — إضافة "update" كـ action مدعوم (حالياً يرسل فقط cancel/delete/transfer)
2. **`src/components/policies/PolicyEditDrawer.tsx`** — بعد حفظ ناجح، إذا الوثيقة ROAD_SERVICE أو ACCIDENT_FEE_EXEMPTION → استدعاء notify-xservice-change بـ action="update"
3. **`src/components/policies/wizard/Step4Payments.tsx`** (أو المكان الذي ينشئ وثائق الباكيج) — بعد إنشاء باكيج ناجح، لكل وثيقة خدمة → استدعاء sync-to-xservice

### الملفات الجديدة:
4. **`supabase/functions/get-xservice-invoice/index.ts`** — دالة تتصل بـ X-Service API `ab-get-invoice` وترجع رابط الفاتورة
5. **إضافة زر فاتورة X** في `PolicyDetailsDrawer.tsx` أو `PolicyInvoicesSection.tsx` — يستدعي get-xservice-invoice ويفتح الرابط

### تغيير قاعدة البيانات:
- لا حاجة لتغيير schema — نستخدم `xservice_policy_id` الموجود في `xservice_sync_log` لتتبع الربط

