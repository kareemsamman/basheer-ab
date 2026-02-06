
# خطة إصلاح عدم ظهور صور الشيكات في جميع الأماكن

## المشكلة الجذرية

بعد التحقق من قاعدة البيانات، وجدت أن حقل `cheque_image_url` فارغ (`null`) لجميع الشيكات:

```sql
SELECT cheque_number, cheque_image_url FROM policy_payments WHERE cheque_number IN ('80001251', '80001252', '80001253');

-- النتيجة:
-- 80001251 | null
-- 80001252 | null  
-- 80001253 | null
```

**السبب**: عند حفظ الدفعات، لا يتم تضمين `cheque_image_url` في أمر الإدراج.

---

## الملفات المتأثرة والإصلاحات المطلوبة

### 1. إصلاح `DebtPaymentModal.tsx` (نافذة تسديد الديون)

**المشكلة**: سطر 656-665 لا يحفظ `cheque_image_url`:

```typescript
// الكود الحالي
const paymentsToInsert = splits.map(split => ({
  policy_id: split.policyId,
  amount: split.amount,
  payment_type: paymentLine.paymentType,
  payment_date: paymentLine.paymentDate,
  cheque_number: paymentLine.paymentType === 'cheque' ? paymentLine.chequeNumber : null,
  notes: paymentLine.notes || `تسديد دين`,
  branch_id: split.branchId,
  batch_id: batchId,
  // ❌ cheque_image_url غير موجود!
}));
```

**الحل**: إضافة `cheque_image_url` للإدراج:

```typescript
const paymentsToInsert = splits.map(split => ({
  // ... الحقول الموجودة
  cheque_image_url: paymentLine.paymentType === 'cheque' ? paymentLine.cheque_image_url : null,
}));
```

---

### 2. إصلاح `PolicyPaymentsSection.tsx` (سجل الدفعات في الوثيقة)

**المشكلة 1**: Interface لا يحتوي على `cheque_image_url`:

```typescript
// سطر 64-73
interface PaymentLine {
  id: string;
  amount: number;
  paymentType: 'cash' | 'cheque' | 'transfer' | 'visa';
  paymentDate: string;
  chequeNumber?: string;
  notes?: string;
  tranzilaPaid?: boolean;
  pendingImages?: File[];
  // ❌ cheque_image_url غير موجود!
}
```

**الحل**: إضافة الحقل للـ interface.

**المشكلة 2**: Insert لا يحفظ `cheque_image_url` (سطر 479-491):

```typescript
const { data, error } = await supabase
  .from('policy_payments')
  .insert({
    policy_id: policyId,
    amount: paymentLine.amount,
    payment_type: paymentLine.paymentType,
    payment_date: paymentLine.paymentDate,
    cheque_number: paymentLine.paymentType === 'cheque' ? paymentLine.chequeNumber : null,
    cheque_status: paymentLine.paymentType === 'cheque' ? 'pending' : null,
    refused: false,
    notes: paymentLine.notes || null,
    branch_id: branchId || null,
    // ❌ cheque_image_url غير موجود!
  })
```

**الحل**: إضافة `cheque_image_url` للإدراج.

**المشكلة 3**: `handleScannedCheques` لا يحفظ CDN URL (سطر 304-336):

```typescript
const payment: PaymentLine = {
  id: paymentId,
  amount: cheque.amount || 0,
  paymentType: 'cheque' as const,
  paymentDate: cheque.payment_date || new Date().toISOString().split('T')[0],
  chequeNumber: cheque.cheque_number || '',
  // ❌ cheque.image_url (CDN) غير محفوظ!
};
```

**الحل**: حفظ `cheque.image_url` في `cheque_image_url`.

---

## ملخص التغييرات

| الملف | السطر | التغيير |
|-------|-------|---------|
| `PolicyPaymentsSection.tsx` | 64-73 | إضافة `cheque_image_url?: string` للـ interface |
| `PolicyPaymentsSection.tsx` | 304-336 | حفظ `cheque.image_url` في `handleScannedCheques` |
| `PolicyPaymentsSection.tsx` | 479-491 | إضافة `cheque_image_url` للإدراج |
| `DebtPaymentModal.tsx` | 656-665 | إضافة `cheque_image_url` للإدراج |

---

## التدفق بعد الإصلاح

```
┌─────────────────────────────────────────────────────────────┐
│  1. المستخدم يمسح الشيكات بالماسح الضوئي                     │
│     ↓                                                        │
│  2. Edge Function يحلل الشيكات ويرفعها إلى CDN              │
│     ↓                                                        │
│  3. يُرجع image_url (رابط CDN) مع بيانات الشيك              │
│     ↓                                                        │
│  4. Frontend يحفظ image_url في cheque_image_url ✓           │
│     ↓                                                        │
│  5. عند الحفظ، cheque_image_url يُدرج في قاعدة البيانات ✓    │
│     ↓                                                        │
│  6. UI يعرض الصور من cheque_image_url ✓                     │
└─────────────────────────────────────────────────────────────┘
```

---

## النتيجة المتوقعة

بعد التنفيذ:
1. ✅ صور الشيكات ستُحفظ في قاعدة البيانات عند الإضافة
2. ✅ صور الشيكات ستظهر في سجل الدفعات (Policy Details)
3. ✅ صور الشيكات ستظهر في صفحة /cheques
4. ✅ صور الشيكات ستظهر في نافذة تسديد الديون

---

## ملاحظة هامة

الشيكات الموجودة حالياً (80001251, 80001252, 80001253) ليس لديها صور محفوظة في قاعدة البيانات. لإصلاحها يجب:
- إما إعادة مسحها بعد تطبيق الإصلاح
- أو تحديث البيانات يدوياً في قاعدة البيانات إذا كانت الصور موجودة على CDN
