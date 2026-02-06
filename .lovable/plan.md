

# إصلاح عدم التطابق بين رصيد العميل ونافذة تسديد الديون

## المشكلة

### ما يحدث الآن:
```text
┌─────────────────────────────────────────────────────────────────┐
│  بروفايل العميل (أشرف زياد ناصر):                               │
│  ├─ إجمالي المتبقي = ₪12,000                                   │
│  └─ يستخدم: policy_payments (الجدول القديم)                     │
├─────────────────────────────────────────────────────────────────┤
│  نافذة تسديد الديون:                                           │
│  ├─ "لا توجد ديون مستحقة"                                       │
│  └─ يستخدم: client_payments + client_debits (الجداول الجديدة)   │
└─────────────────────────────────────────────────────────────────┘
```

### السبب الجذري:
- **الـ Migration نُفذ جزئياً** - تم نقل البيانات للجداول الجديدة
- **لكن `ClientDetails.tsx`** لا يزال يستخدم المنطق القديم (`policy_payments`)
- **بينما `DebtPaymentModal.tsx`** يستخدم المنطق الجديد (`client_payments` + `client_debits`)

### أرقام العميل الفعلية:
| المصدر | القيمة |
|--------|--------|
| `get_client_balance` (القديم) | إجمالي المتبقي = ₪12,000 |
| `get_client_wallet_balance` (الجديد) | رصيد المحفظة = -₪45,699 (دفع أكثر!) |
| `client_debits` (non-ELZAMI) | ₪64,600 |
| `client_payments` | ₪110,299 |

---

## الحل المطلوب

### تحديث `ClientDetails.tsx` ليستخدم نفس مصدر البيانات

**الملف:** `src/components/clients/ClientDetails.tsx`

#### 1. تحديث `fetchPaymentSummary()`

**قبل:**
```typescript
const fetchPaymentSummary = async () => {
  // ... يستخدم policies + policy_payments
  const totalInsurance = policiesData.reduce(...);
  const totalPaid = paymentsData.filter(...).reduce(...);
  setPaymentSummary({
    total_paid: totalPaid,
    total_remaining: Math.max(0, totalInsurance - totalPaid),
  });
};
```

**بعد:**
```typescript
const fetchPaymentSummary = async () => {
  try {
    // استخدام get_client_wallet_balance للحصول على الرصيد الصحيح
    const { data: walletData } = await supabase.rpc('get_client_wallet_balance', {
      p_client_id: client.id
    });
    
    // جلب الربح من الوثائق مباشرة (للمشرفين فقط)
    const { data: policiesData } = await supabase
      .from('policies')
      .select('profit')
      .eq('client_id', client.id)
      .eq('cancelled', false)
      .eq('transferred', false)
      .is('deleted_at', null);
    
    const totalProfit = (policiesData || []).reduce((sum, p) => sum + (p.profit || 0), 0);
    
    if (walletData && walletData.length > 0) {
      const wallet = walletData[0];
      setPaymentSummary({
        total_paid: wallet.total_credits + wallet.total_refunds,
        total_remaining: Math.max(0, wallet.wallet_balance),
        total_profit: totalProfit,
      });
    } else {
      setPaymentSummary({ total_paid: 0, total_remaining: 0, total_profit: 0 });
    }
  } catch (error) {
    console.error('Error fetching payment summary:', error);
  }
};
```

---

## ملخص التغييرات

| الموقع | التغيير |
|--------|---------|
| `ClientDetails.tsx` → `fetchPaymentSummary()` | استخدام `get_client_wallet_balance` بدلاً من الحساب اليدوي |

---

## النتيجة المتوقعة

بعد التحديث:
```text
┌─────────────────────────────────────────────────────────────────┐
│  بروفايل العميل (أشرف زياد ناصر):                               │
│  ├─ إجمالي المتبقي = ₪0 (أو القيمة الحقيقية من المحفظة)         │
│  └─ يستخدم: get_client_wallet_balance                           │
├─────────────────────────────────────────────────────────────────┤
│  نافذة تسديد الديون:                                           │
│  ├─ نفس القيمة = ₪0 (لا توجد ديون)                             │
│  └─ يستخدم: get_client_wallet_balance (نفس المصدر!)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## ملاحظة مهمة

لهذا العميل تحديداً، الرصيد الفعلي = **-₪45,699** (سالب = دفع أكثر من المطلوب)

هذا يعني أن العميل ليس عليه ديون، بل له رصيد دائن!

الـ Migration نقل الدفعات من `policy_payments` إلى `client_payments`، لكن `ClientDetails.tsx` لا يزال يقرأ من الجدول القديم.

