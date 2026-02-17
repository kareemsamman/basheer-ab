

# مزامنة حذف/إلغاء/تحويل الوثائق مع X-Service

## المشكلة
حالياً المزامنة تعمل فقط عند **إنشاء** وثيقة جديدة. لكن عندما يقوم المدير بـ:
- **حذف** وثيقة
- **إلغاء** وثيقة
- **تحويل** وثيقة لسيارة أخرى

لا يتم إبلاغ X-Service بهذه التغييرات.

## الحل

### 1. إنشاء دالة جديدة `notify-xservice-change`
دالة واحدة تتعامل مع جميع التغييرات (حذف، إلغاء، تحويل) وترسلها لـ X-Service عبر endpoint مخصص.

الدالة ترسل payload بالشكل:
```text
{
  api_key: "...",
  action: "cancel" | "delete" | "transfer",
  customer: { id_number, full_name },
  car: { car_number },
  policy: { service_type, start_date, end_date },
  transfer_to_car: { car_number, ... }  // فقط في حالة التحويل
}
```

### 2. استدعاء الدالة من 3 أماكن

**عند الحذف** — في `delete-policy/index.ts`:
- قبل حذف الوثائق، نجلب بيانات الوثائق التي نوعها ROAD_SERVICE أو ACCIDENT_FEE_EXEMPTION
- نرسل إشعار حذف لكل وثيقة مؤهلة

**عند الإلغاء** — في `CancelPolicyModal.tsx`:
- بعد نجاح الإلغاء، نستدعي `notify-xservice-change` بـ action = "cancel"

**عند التحويل** — في `TransferPolicyModal.tsx`:
- بعد نجاح التحويل، نستدعي `notify-xservice-change` بـ action = "transfer" مع بيانات السيارة الجديدة

### 3. مطلوب من X-Service
يجب إضافة endpoint جديد `ab-sync-update` في X-Service يستقبل هذه الأحداث ويعالجها:
- **cancel**: يلغي الوثيقة في نظام X
- **delete**: يحذف الوثيقة من نظام X
- **transfer**: يحدّث السيارة المرتبطة بالوثيقة (أو يلغي القديمة وينشئ جديدة)

---

## القسم التقني

### الملفات الجديدة:
- `supabase/functions/notify-xservice-change/index.ts` — الدالة الجديدة

### الملفات المعدلة:
- `supabase/functions/delete-policy/index.ts` — إضافة استدعاء المزامنة قبل الحذف
- `src/components/policies/CancelPolicyModal.tsx` — إضافة استدعاء المزامنة بعد الإلغاء
- `src/components/policies/TransferPolicyModal.tsx` — إضافة استدعاء المزامنة بعد التحويل

### المنطق:
1. الدالة الجديدة تقرأ `xservice_settings` وتتحقق أن المزامنة مفعلة
2. تجلب بيانات العميل والسيارة من الوثيقة
3. ترسل الحدث لـ X-Service عبر URL مبني من `api_url` + `/functions/v1/ab-sync-update`
4. تسجل النتيجة في `xservice_sync_log`
5. إذا فشل الإرسال، لا يُمنع الحذف/الإلغاء/التحويل — فقط يُسجل الخطأ

### ملاحظة مهمة:
التحويل في AB يعني نقل الوثيقة من سيارة لأخرى. في X-Service حالياً لا يوجد "تحويل"، لذلك يجب إبلاغ صاحب X-Service بإضافة هذه الوظيفة. كحل مؤقت يمكن إرسال "cancel" للقديمة + "create" للجديدة.
