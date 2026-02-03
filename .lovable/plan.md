
# خطة: تسريع استجابة فلتر السيارات

---

## المشكلة

عند النقر على فلتر السيارات، هناك تأخير ملحوظ (~2-3 ثوانٍ) قبل تحديث الواجهة.

**السبب الجذري:**
- `PolicyYearTimeline` يستلم قائمة الوثائق المفلترة
- عند كل تغيير في الفلتر، يتم إطلاق **3 طلبات API منفصلة**:
  1. `fetchPaymentInfo` - جلب معلومات الدفعات
  2. `fetchAccidentInfo` - جلب معلومات الحوادث
  3. `fetchChildrenInfo` - جلب معلومات السائقين الإضافيين

كل طلب يستغرق ~500-800ms، مما يجعل الإجمالي ~2-3 ثوانٍ.

---

## الحل

**نقل جلب البيانات للمستوى الأعلى (ClientDetails)** بحيث:
- يتم جلب جميع البيانات **مرة واحدة** عند تحميل الصفحة
- عند تغيير الفلتر، يتم **فلترة البيانات محلياً** بدون طلبات API جديدة

---

## التغييرات الفنية

### الملف 1: `src/components/clients/ClientDetails.tsx`

**إضافة جلب بيانات الدفعات/الحوادث/السائقين:**

```typescript
// State جديد
const [policyPaymentInfo, setPolicyPaymentInfo] = useState<Record<string, {paid: number; remaining: number}>>({});
const [policyAccidentCounts, setPolicyAccidentCounts] = useState<Record<string, number>>({});
const [policyChildrenCounts, setPolicyChildrenCounts] = useState<Record<string, number>>({});

// دالة جلب البيانات الموحدة
const fetchPolicyMetadata = async (policyIds: string[], policiesData: PolicyRecord[]) => {
  // Payments
  const { data: paymentsData } = await supabase
    .from('policy_payments')
    .select('policy_id, amount, refused')
    .in('policy_id', policyIds);
    
  const paymentInfo: Record<string, {paid: number; remaining: number}> = {};
  policiesData.forEach(p => {
    const paid = (paymentsData || [])
      .filter(pay => pay.policy_id === p.id && !pay.refused)
      .reduce((sum, pay) => sum + pay.amount, 0);
    paymentInfo[p.id] = { paid, remaining: p.insurance_price - paid };
  });
  setPolicyPaymentInfo(paymentInfo);
  
  // Accidents
  const { data: accData } = await supabase
    .from('accident_reports')
    .select('policy_id')
    .in('policy_id', policyIds);
  const accCounts: Record<string, number> = {};
  (accData || []).forEach(row => {
    accCounts[row.policy_id] = (accCounts[row.policy_id] || 0) + 1;
  });
  setPolicyAccidentCounts(accCounts);
  
  // Children
  const { data: childData } = await supabase
    .from('policy_children')
    .select('policy_id')
    .in('policy_id', policyIds);
  const childCounts: Record<string, number> = {};
  (childData || []).forEach(row => {
    childCounts[row.policy_id] = (childCounts[row.policy_id] || 0) + 1;
  });
  setPolicyChildrenCounts(childCounts);
};
```

**استدعاء داخل `fetchPolicies`:**

```typescript
const fetchPolicies = async () => {
  // ... existing code ...
  if (data && data.length > 0) {
    setPolicies(data);
    // جلب البيانات الإضافية مرة واحدة
    await fetchPolicyMetadata(data.map(p => p.id), data);
  }
};
```

**تمرير البيانات لـ PolicyYearTimeline:**

```tsx
<PolicyYearTimeline
  policies={filteredPolicies}
  paymentInfo={policyPaymentInfo}       // ← جديد
  accidentInfo={policyAccidentCounts}   // ← جديد
  childrenInfo={policyChildrenCounts}   // ← جديد
  onPolicyClick={handlePolicyClick}
  // ... باقي الخصائص
/>
```

---

### الملف 2: `src/components/clients/PolicyYearTimeline.tsx`

**تحديث Props:**

```typescript
interface PolicyYearTimelineProps {
  policies: PolicyRecord[];
  paymentInfo?: Record<string, { paid: number; remaining: number }>;  // ← جديد
  accidentInfo?: Record<string, number>;                               // ← جديد
  childrenInfo?: Record<string, number>;                               // ← جديد
  onPolicyClick: (policyId: string) => void;
  // ... باقي الخصائص
}
```

**إزالة useEffect للجلب:**

```typescript
// قبل: 3 useEffect منفصلة تجلب البيانات
// بعد: استخدام البيانات الممررة مباشرة

// حذف useEffect الموجودة (السطور 249-346)
// استخدام props مباشرة:

const { paymentInfo = {}, accidentInfo = {}, childrenInfo = {} } = props;

// حذف:
// const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({});
// const [accidentInfo, setAccidentInfo] = useState<Record<string, number>>({});
// const [childrenInfo, setChildrenInfo] = useState<Record<string, number>>({});
// const [loadingPayments, setLoadingPayments] = useState(true);
```

---

## مخطط التحسين

```text
قبل:                                      بعد:
┌──────────────────┐                     ┌──────────────────┐
│   نقر الفلتر     │                     │   نقر الفلتر     │
└────────┬─────────┘                     └────────┬─────────┘
         ↓                                        ↓
┌──────────────────┐                     ┌──────────────────┐
│  تحديث الحالة   │                     │  تحديث الحالة   │
└────────┬─────────┘                     └────────┬─────────┘
         ↓                                        ↓
┌──────────────────┐                     ┌──────────────────┐
│ فلترة الوثائق   │                     │ فلترة الوثائق   │
└────────┬─────────┘                     └────────┬─────────┘
         ↓                                        ↓
┌──────────────────┐                     ┌──────────────────┐
│ PolicyYearTimeline                     │ PolicyYearTimeline
│  ↓                │                     │ (بيانات جاهزة)  │
│  API: payments    │ ~700ms             │                  │
│  API: accidents   │ ~500ms             │  ← فوري          │
│  API: children    │ ~500ms             │                  │
└────────┬─────────┘                     └────────┬─────────┘
         ↓                                        ↓
   ~1.7 ثانية                               ~50ms
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/clients/ClientDetails.tsx` | جلب البيانات الإضافية مركزياً + تمريرها |
| `src/components/clients/PolicyYearTimeline.tsx` | استقبال البيانات كـ props بدلاً من جلبها |

---

## النتيجة المتوقعة

1. ✅ النقر على فلتر السيارات يستجيب **فوراً** (~50ms)
2. ✅ لا توجد طلبات API عند تغيير الفلتر
3. ✅ البيانات تُجلب مرة واحدة عند تحميل الصفحة
4. ✅ تجربة مستخدم سلسة بدون تأخير
