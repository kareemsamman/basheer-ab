
# خطة إصلاح ثلاث مشاكل في الباقات والدفعات ورسائل SMS

## المشاكل المكتشفة

### المشكلة 1: الباقة لا تُنشأ بشكل صحيح (group_id = null)

**السبب الجذري:**
في ملف `PolicyWizard.tsx` سطر 700 و 1066، الكود يتحقق فقط من `packageAddons[0]` (إلزامي) و `packageAddons[1]` (ثالث/شامل):

```typescript
// سطر 700 - إنشاء المجموعة
if (packageMode && (packageAddons[0].enabled || packageAddons[1].enabled))

// سطر 1066 - تحديد isPackage
isPackage: packageMode && (packageAddons[0]?.enabled || packageAddons[1]?.enabled)
```

لكن في الحالة الحالية:
- الوثيقة الرئيسية: **ثالث/شامل** (policy_type_parent = THIRD_FULL)
- الإضافات: **إلزامي + خدمات طريق**

المشكلة أن:
- `packageAddons[0]` = elzami (مفعّل)
- `packageAddons[1]` = third_full (غير مفعّل - لأن الرئيسي هو third_full)
- `packageAddons[2]` = road_service (مفعّل)
- `packageAddons[3]` = accident_fee_exemption

الكود يتحقق فقط من [0] و [1]، لكن إذا كان الرئيسي ثالث/شامل والإضافات تشمل خدمات طريق فقط (index 2)، لن يتم إنشاء group_id!

---

### المشكلة 2: دفعة الفيزا لا تظهر للعامل (لكن تظهر للمدير)

**السبب الجذري:**
بيانات الدفعات في قاعدة البيانات:

| payment_type | amount | branch_id |
|--------------|--------|-----------|
| visa | 1500 | **NULL** |
| cash | 2204 | 146727e4... |

دفعة الفيزا لها `branch_id = NULL`!

سياسة RLS على جدول `policy_payments`:
```sql
can_access_branch(auth.uid(), branch_id)
```

- للمدير: الدالة تُرجع `TRUE` لأي قيمة
- للعامل: عندما `branch_id = NULL`، الدالة تُرجع `FALSE`

**لماذا branch_id = NULL في دفعة الفيزا؟**
دفعات الفيزا تُنشأ عبر Tranzila webhook الذي يعمل بخلفية بدون معرفة branch_id الأصلي.

---

### المشكلة 3: خطأ في إرسال SMS للعامل بعد إنشاء الوثيقة

**السبب الجذري:**
في `PolicySuccessDialog.tsx`، عند `isPackage = true`:

```typescript
const { data: groupPolicies } = await supabase
  .from('policies')
  .select('id')
  .eq('group_id', policyId);  // ← خطأ! policyId ليس هو group_id
```

`policyId` هو ID الوثيقة الرئيسية، وليس `group_id`. يجب جلب group_id من الوثيقة أولاً.

بالإضافة لذلك، بما أن الباقة لم تُنشأ بسبب المشكلة 1، الاستعلام لن يجد أي وثائق.

---

## الحلول

### الحل 1: إصلاح شرط إنشاء الباقة

**الملف:** `src/components/policies/PolicyWizard.tsx`

**التغيير في سطر 700:**
```typescript
// قبل:
if (packageMode && (packageAddons[0].enabled || packageAddons[1].enabled))

// بعد:
if (packageMode && packageAddons.some(addon => addon.enabled))
```

**التغيير في سطر 1066:**
```typescript
// قبل:
isPackage: packageMode && (packageAddons[0]?.enabled || packageAddons[1]?.enabled)

// بعد:
isPackage: packageMode && packageAddons.some(addon => addon.enabled)
```

---

### الحل 2: إصلاح branch_id لدفعات الفيزا

**الخيار أ - في wizard:** عند إنشاء دفعة فيزا مؤقتة قبل Tranzila، تمرير branch_id.

**الخيار ب - في Tranzila webhook:** جلب branch_id من الوثيقة وتعيينه للدفعة.

**التنفيذ (الخيار ب) - الملف:** `supabase/functions/tranzila-webhook/index.ts`

عند إنشاء الدفعة، جلب branch_id من الوثيقة:
```typescript
// جلب branch_id من الوثيقة
const { data: policyData } = await supabase
  .from('policies')
  .select('branch_id')
  .eq('id', policyId)
  .single();

// إنشاء الدفعة مع branch_id
await supabase.from('policy_payments').insert({
  policy_id: policyId,
  amount: amount,
  payment_type: 'visa',
  branch_id: policyData?.branch_id || null,  // إضافة branch_id
  // ...
});
```

**إصلاح البيانات الحالية (migration):**
```sql
UPDATE policy_payments pp
SET branch_id = p.branch_id
FROM policies p
WHERE pp.policy_id = p.id
  AND pp.branch_id IS NULL
  AND pp.payment_type = 'visa';
```

---

### الحل 3: إصلاح استعلام group_id في PolicySuccessDialog

**الملف:** `src/components/policies/PolicySuccessDialog.tsx`

**تغيير الدالتين handlePrintInvoice و handleSendSms:**

```typescript
if (isPackage) {
  // أولاً: جلب group_id من الوثيقة الرئيسية
  const { data: mainPolicy, error: mainPolicyError } = await supabase
    .from('policies')
    .select('group_id')
    .eq('id', policyId)
    .single();
  
  if (mainPolicyError) throw mainPolicyError;
  
  const groupId = mainPolicy?.group_id;
  
  if (!groupId) {
    // لا توجد باقة - استخدم الوثيقة الفردية
    result = await supabase.functions.invoke('send-invoice-sms', {
      body: { policy_id: policyId, skip_sms: true }
    });
  } else {
    // جلب جميع وثائق الباقة
    const { data: groupPolicies, error: fetchError } = await supabase
      .from('policies')
      .select('id')
      .eq('group_id', groupId);
    
    if (fetchError) throw fetchError;
    
    const policyIds = groupPolicies?.map(p => p.id) || [policyId];
    
    result = await supabase.functions.invoke('send-package-invoice-sms', {
      body: { policy_ids: policyIds, skip_sms: true }
    });
  }
}
```

---

## ملخص الملفات المطلوب تعديلها

| الملف | التغيير |
|-------|---------|
| `src/components/policies/PolicyWizard.tsx` | إصلاح شرط إنشاء الباقة (سطر 700 و 1066) |
| `src/components/policies/PolicySuccessDialog.tsx` | إصلاح استعلام group_id في handlePrintInvoice و handleSendSms |
| `supabase/functions/tranzila-webhook/index.ts` | إضافة branch_id لدفعات الفيزا |
| Database Migration | تحديث branch_id للدفعات الموجودة |

---

## النتائج المتوقعة

1. ✅ عند إنشاء باقة (ثالث + إلزامي + خدمات طريق)، يتم إنشاء group_id بشكل صحيح
2. ✅ جميع الوثائق في الباقة تظهر معاً في تفاصيل الوثيقة
3. ✅ دفعات الفيزا تظهر للعمال وليس فقط للمدراء
4. ✅ إرسال SMS يعمل للعمال بعد إنشاء الوثيقة
5. ✅ طباعة الفاتورة تعمل للباقات بشكل صحيح
