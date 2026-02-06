
# إصلاح نص رسائل تذكير الدفع

## المشكلة

النص الحالي في رسائل SMS يقول:
```
لديك مبلغ متبقي: ₪10,098
```

هذا يعطي انطباع أن AB مدينة للعميل! لكن العكس صحيح.

**المطلوب:**
```
عليك تسديد المبلغ: ₪10,098

الوثائق:
• إلزامي - 12-345-67 - ₪500
• شامل - 12-345-67 - ₪1,200
...
```

---

## الملفات المتأثرة

| الملف | السبب |
|-------|-------|
| `supabase/functions/send-bulk-debt-sms/index.ts` | رسائل SMS الجماعية |
| `supabase/functions/send-manual-reminder/index.ts` | رسالة SMS الفردية |
| `src/pages/DebtTracking.tsx` | رابط WhatsApp |

---

## التغييرات المطلوبة

### 1. تحديث `send-bulk-debt-sms/index.ts`

**قبل:**
```typescript
let message = `مرحباً ${clientName}،

لديك مبلغ متبقي: ₪${totalRemaining.toLocaleString()}

AB للتأمين`;
```

**بعد:**
```typescript
// جلب تفاصيل الوثائق للعميل
const { data: policies } = await supabase.rpc(
  "report_debt_policies_for_clients",
  { p_client_ids: [client.client_id] }
);

// بناء قائمة الوثائق
const policyLines = (policies || [])
  .filter((p: any) => (p.remaining || 0) > 0)
  .map((p: any) => {
    const typeLabel = getPolicyTypeLabel(p.policy_type_parent, p.policy_type_child);
    const car = p.car_number || '';
    const remaining = Math.round(p.remaining || 0);
    return `• ${typeLabel} - ${car} - ₪${remaining.toLocaleString()}`;
  })
  .slice(0, 5)  // أقصى 5 وثائق لتقليل طول الرسالة
  .join('\n');

let message = `مرحباً ${clientName}،

عليك تسديد المبلغ: ₪${totalRemaining.toLocaleString()}

الوثائق:
${policyLines}

AB للتأمين`;
```

### 2. تحديث `send-manual-reminder/index.ts`

**قبل:**
```typescript
finalMessage = `مرحباً ${client.full_name}،

لديك مبلغ متبقي على وثائق التأمين: ₪${totalRemaining.toLocaleString()}

يرجى التواصل معنا لتسوية المبلغ.`;
```

**بعد:**
```typescript
// جلب تفاصيل الوثائق للعميل
const { data: policies } = await supabase.rpc(
  "report_debt_policies_for_clients",
  { p_client_ids: [client_id] }
);

// بناء قائمة الوثائق
const policyLines = (policies || [])
  .filter((p: any) => (p.remaining || 0) > 0)
  .map((p: any) => {
    const typeLabel = getPolicyTypeLabel(p.policy_type_parent, p.policy_type_child);
    const car = p.car_number || '';
    const remaining = Math.round(p.remaining || 0);
    return `• ${typeLabel} - ${car} - ₪${remaining.toLocaleString()}`;
  })
  .slice(0, 5)
  .join('\n');

finalMessage = `مرحباً ${client.full_name}،

عليك تسديد المبلغ: ₪${totalRemaining.toLocaleString()}

الوثائق:
${policyLines}

يرجى التواصل معنا للتسوية.`;
```

### 3. تحديث `DebtTracking.tsx` - WhatsApp

**قبل:**
```typescript
const message = `مرحباً ${client.client_name}، لديك مبلغ متبقي ${client.total_remaining.toLocaleString()} شيكل. يرجى التواصل معنا لتسوية المبلغ.`;
```

**بعد:**
```typescript
// بناء قائمة الوثائق للواتساب
const policyDetails = client.policies
  .filter(p => p.remaining > 0)
  .slice(0, 5)
  .map(p => {
    const typeLabel = getPolicyTypeLabel(p.policy_type_parent, p.policy_type_child);
    return `• ${typeLabel} - ${p.car_number || ''} - ₪${p.remaining.toLocaleString()}`;
  })
  .join('\n');

const message = `مرحباً ${client.client_name}،

عليك تسديد المبلغ: ${client.total_remaining.toLocaleString()} شيكل

الوثائق:
${policyDetails}

يرجى التواصل معنا للتسوية.`;
```

---

## دالة مساعدة مشتركة (Edge Functions)

إضافة دالة `getPolicyTypeLabel` في كل Edge Function:

```typescript
const POLICY_TYPE_LABELS: Record<string, string> = {
  'ELZAMI': 'إلزامي',
  'THIRD_FULL': 'ثالث/شامل',
  'THIRD_ONLY': 'طرف ثالث',
  'ROAD_SERVICE': 'خدمات طريق',
  'ACCIDENT_FEE_EXEMPTION': 'إعفاء رسوم',
};

const getPolicyTypeLabel = (parent: string | null, child: string | null): string => {
  if (!parent) return 'وثيقة';
  const parentLabel = POLICY_TYPE_LABELS[parent] || parent;
  if (child && parent === 'THIRD_FULL') {
    return child === 'FULL' ? 'شامل' : child === 'THIRD' ? 'ثالث' : childLabel;
  }
  return parentLabel;
};
```

---

## مثال على الرسالة الجديدة

```
مرحباً Kareem Test،

عليك تسديد المبلغ: ₪10,098

الوثائق:
• إلزامي - 12-345-67 - ₪2,500
• شامل - 12-345-67 - ₪4,000
• خدمات طريق - 12-345-67 - ₪598
• إلزامي - 98-765-43 - ₪3,000

AB للتأمين
📍 بيت حنينا
📞 026307377 | 0544494440 | 0546060886
```

---

## خطوات التنفيذ

1. تحديث `send-bulk-debt-sms/index.ts` مع الرسالة الجديدة + تفاصيل الوثائق
2. تحديث `send-manual-reminder/index.ts` مع الرسالة الجديدة + تفاصيل الوثائق  
3. تحديث `DebtTracking.tsx` لرابط WhatsApp
4. نشر Edge Functions المحدثة
