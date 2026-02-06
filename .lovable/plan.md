
# خطة إضافة زر مسح الشيكات في جميع نقاط الدفع

## الوضع الحالي
زر "مسح شيكات" موجود **فقط** في Policy Wizard (الخطوة 4).

## المطلوب
إضافة الزر في **جميع** الأماكن التي يمكن فيها الدفع بالشيكات، بجانب زر "تقسيط".

---

## الأماكن المطلوب التحديث (5 ملفات)

| الملف | الموقع | الوصف |
|-------|--------|-------|
| `DebtPaymentModal.tsx` | صفحة متابعة الديون | دفع ديون العميل |
| `PackagePaymentModal.tsx` | صفحة العميل - الباقات | دفع للباقة |
| `SinglePolicyPaymentModal.tsx` | صفحة العميل - وثيقة فردية | دفع لوثيقة واحدة |
| `PolicyPaymentsSection.tsx` | تفاصيل الوثيقة | إضافة دفعة للوثيقة |
| `BrokerWallet.tsx` | محفظة الوسيط | دفع للوسيط |

---

## التغييرات لكل ملف

### لكل ملف سنضيف:

1. **Import** للمكون:
```tsx
import { ChequeScannerDialog } from '@/components/payments/ChequeScannerDialog';
import { Scan } from 'lucide-react';
```

2. **State** للـ dialog:
```tsx
const [showChequeScannerModal, setShowChequeScannerModal] = useState(false);
```

3. **Function** لمعالجة الشيكات المكتشفة:
```tsx
const handleScannedCheques = (cheques: any[]) => {
  const newPayments = cheques.map(cheque => ({
    id: crypto.randomUUID(),
    amount: cheque.amount || 0,
    paymentType: 'cheque' as const,
    paymentDate: cheque.payment_date || new Date().toISOString().split('T')[0],
    chequeNumber: cheque.cheque_number || '',
  }));
  setPaymentLines(prev => [...prev, ...newPayments]);
  toast.success(`تم إضافة ${newPayments.length} دفعة شيك`);
};
```

4. **زر** بجانب التقسيط:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setShowChequeScannerModal(true)}
>
  <Scan className="h-4 w-4 ml-2" />
  مسح شيكات
</Button>
```

5. **Dialog** في نهاية الـ component:
```tsx
<ChequeScannerDialog
  open={showChequeScannerModal}
  onOpenChange={setShowChequeScannerModal}
  onConfirm={handleScannedCheques}
/>
```

---

## موقع الزر في كل ملف

```text
┌─────────────────────────────────────────────────────────────┐
│ الدفعات                     [تقسيط] [مسح شيكات] [إضافة دفعة] │
└─────────────────────────────────────────────────────────────┘
```

الزر سيكون بين "تقسيط" و "إضافة دفعة"

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `src/components/debt/DebtPaymentModal.tsx` | إضافة زر + dialog + handler |
| `src/components/clients/PackagePaymentModal.tsx` | إضافة زر + dialog + handler |
| `src/components/clients/SinglePolicyPaymentModal.tsx` | إضافة زر + dialog + handler |
| `src/components/policies/PolicyPaymentsSection.tsx` | إضافة زر + dialog + handler |
| `src/pages/BrokerWallet.tsx` | إضافة زر + dialog + handler |

---

## النتيجة المتوقعة

1. **زر مسح شيكات** متاح في كل مكان يمكن الدفع فيه
2. **العميل يمكنه المسح عدة مرات** - الشيكات الجديدة تُضاف للقائمة
3. **تجربة موحدة** عبر كل النظام
4. **تقليل وقت الإدخال** للدفعات بالشيكات
