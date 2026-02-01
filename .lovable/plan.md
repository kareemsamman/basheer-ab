
# خطة: إصلاح مشاكل صفحة متابعة الديون

## المشاكل المكتشفة

بعد تحليل الكود اكتشفت **3 مشاكل رئيسية**:

### 1. عدم تطابق أسماء الأعمدة
الدالة في قاعدة البيانات ترجع أسماء مختلفة عما يتوقعه الكود:

| الدالة ترجع | الكود يتوقع |
|-------------|-------------|
| `oldest_end_date` | `earliest_expiry` |
| `days_until_oldest` | `days_until_expiry` |

هذا يسبب ظهور "NaN" وعدم عمل بادج الحالة.

### 2. عدم مسح حالة العميل بعد إغلاق المودال
عند إغلاق مودال الدفع، `paymentClient` لا يتم مسحه، مما يجعل البيانات القديمة تظهر في المرة التالية.

### 3. عدم تحديث القائمة بشكل صحيح
بعد الدفع، يتم استدعاء `fetchDebtData()` لكن التحديث قد لا يظهر فوراً.

---

## الحل

### الملف: `src/pages/DebtTracking.tsx`

**التغيير 1**: إصلاح mapping الأعمدة (سطر 141-142)
```typescript
// قبل
earliest_expiry: r.earliest_expiry ? String(r.earliest_expiry) : null,
days_until_expiry: r.days_until_expiry == null || isNaN(Number(r.days_until_expiry)) ? null : Number(r.days_until_expiry),

// بعد
earliest_expiry: r.oldest_end_date ? String(r.oldest_end_date) : null,
days_until_expiry: r.days_until_oldest == null || isNaN(Number(r.days_until_oldest)) ? null : Number(r.days_until_oldest),
```

**التغيير 2**: مسح `paymentClient` عند إغلاق المودال (سطور 689-700)
```typescript
<DebtPaymentModal
  open={paymentModalOpen}
  onOpenChange={(isOpen) => {
    setPaymentModalOpen(isOpen);
    if (!isOpen) {
      setPaymentClient(null);  // مسح البيانات القديمة
    }
  }}
  clientId={paymentClient.client_id}
  // ...
  onSuccess={() => {
    setPaymentClient(null);  // مسح فوري
    fetchDebtData();         // تحديث البيانات
  }}
/>
```

---

## ملخص التغييرات

| الملف | التغيير |
|-------|---------|
| `src/pages/DebtTracking.tsx` | إصلاح mapping + مسح الحالة |

---

## النتيجة المتوقعة

- رقم الهاتف سيظهر بشكل صحيح لجميع العملاء
- بادج عدد الأيام سيعمل بدون NaN
- بعد الدفع، القائمة ستتحدث والمودال سينظف حالته
