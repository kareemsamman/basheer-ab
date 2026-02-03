

# خطة: إضافة دفعة إلزامي مقفلة تلقائياً عند تفعيل الإضافة

## المشكلة

عند إنشاء باقة تحتوي على إلزامي كإضافة (مثل الصورة: خدمات طريق 300₪ + إلزامي 1200₪ + إجمالي 2,700₪):
- الانتقال للخطوة 4 يظهر "لا توجد دفعات"
- المتوقع: إضافة دفعة مقفلة بقيمة سعر الإلزامي (1200₪)

### الحالة الحالية
- المنطق الموجود في `handleNext` يعمل فقط عندما يكون `policy.policy_type_parent === 'ELZAMI'`
- لا يشمل حالة الإلزامي كإضافة في الباقة (packageMode + elzamiAddon.enabled)

---

## التغييرات المطلوبة

### الملف: `src/components/policies/PolicyWizard.tsx`

#### تحديث منطق `handleNext` (السطور 318-345):

**الكود الحالي:**
```typescript
const handleNext = () => {
  if (!validateStep(currentStep)) return;
  const nextStep = Math.min(currentStep + 1, steps.length);
  
  // Auto-fill LOCKED payment for ELZAMI when entering Step 4
  if (nextStep === 4 && policy.policy_type_parent === 'ELZAMI') {
    // ... existing logic for main ELZAMI only
  }
  
  goToStep(nextStep);
};
```

**الكود الجديد:**
```typescript
const handleNext = () => {
  if (!validateStep(currentStep)) return;
  const nextStep = Math.min(currentStep + 1, steps.length);
  
  // Auto-fill LOCKED payment for ELZAMI when entering Step 4
  // This applies when:
  // 1. Main policy is ELZAMI, OR
  // 2. ELZAMI addon is enabled in package mode
  if (nextStep === 4) {
    const hasLockedElzamiPayment = payments.some(p => p.locked && p.source === 'system');
    
    if (!hasLockedElzamiPayment) {
      const isMainElzami = policy.policy_type_parent === 'ELZAMI';
      const elzamiAddon = packageAddons.find(a => a.type === 'elzami' && a.enabled);
      const isAddonElzami = packageMode && elzamiAddon?.enabled;
      
      if (isMainElzami || isAddonElzami) {
        // Calculate ELZAMI price:
        // - Main ELZAMI: use policy.insurance_price
        // - Addon ELZAMI: use elzamiAddon.insurance_price
        const elzamiPrice = isMainElzami 
          ? parseFloat(policy.insurance_price) || 0
          : parseFloat(elzamiAddon?.insurance_price || '0');
        
        if (elzamiPrice > 0) {
          // Use ELZAMI start_date if available, else today
          const elzamiDate = isAddonElzami && elzamiAddon?.start_date
            ? elzamiAddon.start_date
            : policy.start_date || new Date().toISOString().split('T')[0];
          
          setPayments([{
            id: crypto.randomUUID(),
            payment_type: 'cash',
            amount: elzamiPrice,
            payment_date: elzamiDate,
            refused: false,
            locked: true,
            source: 'system',
            locked_label: 'دفعة إلزامي – تلقائية',
          }]);
        }
      }
    }
  }
  
  goToStep(nextStep);
};
```

---

## آلية العمل

```text
┌──────────────────────────────────────────────────────────┐
│ الخطوة 3: إضافات الباقة                                  │
│                                                          │
│ ☑ إلزامي         → 1200₪ (شركة هبول)                    │
│ ☑ خدمات طريق     → 300₪  (شركة اكس)                     │
│ ☐ إعفاء رسوم حادث                                        │
└────────────────────────────┬─────────────────────────────┘
                             ↓ النقر على "التالي"
┌──────────────────────────────────────────────────────────┐
│ الخطوة 4: الدفعات                                        │
│                                                          │
│ إجمالي الوثيقة: 2,700₪                                   │
│ مجموع الدفعات:  1,200₪                                   │
│ المتبقي:        1,500₪                                   │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🔒 دفعة إلزامي – تلقائية                             │ │
│ │ نقدي | 1,200₪ | 03/02/2027                           │ │
│ │ [مقفلة - لا يمكن التعديل أو الحذف]                   │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ [+ إضافة دفعة] [تقسيط]                                   │
└──────────────────────────────────────────────────────────┘
```

---

## اعتبارات إضافية

### 1. تحديث السعر إذا رجع المستخدم للخطوة 3
إذا غيّر المستخدم سعر الإلزامي وعاد للخطوة 4:
- البحث عن دفعة مقفلة موجودة
- تحديث قيمتها إذا تغير السعر
- أو إضافة جديدة إذا تم تفعيل الإلزامي الآن

```typescript
// Check if price changed and update locked payment
if (hasLockedElzamiPayment) {
  const lockedPayment = payments.find(p => p.locked && p.source === 'system');
  const newElzamiPrice = isMainElzami 
    ? parseFloat(policy.insurance_price) || 0
    : parseFloat(elzamiAddon?.insurance_price || '0');
  
  if (lockedPayment && lockedPayment.amount !== newElzamiPrice) {
    // Update the locked payment amount
    setPayments(payments.map(p => 
      p.locked && p.source === 'system' 
        ? { ...p, amount: newElzamiPrice }
        : p
    ));
  }
}
```

### 2. إزالة الدفعة إذا تم إلغاء تفعيل الإلزامي
إذا رجع المستخدم للخطوة 3 وأزال الإلزامي → إزالة الدفعة المقفلة

```typescript
// If ELZAMI was disabled, remove the locked payment
if (!isMainElzami && !isAddonElzami && hasLockedElzamiPayment) {
  setPayments(payments.filter(p => !(p.locked && p.source === 'system')));
}
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/policies/PolicyWizard.tsx` | تحديث منطق `handleNext` لإضافة/تحديث/إزالة دفعة الإلزامي المقفلة |

---

## النتيجة المتوقعة

| السيناريو | النتيجة |
|-----------|---------|
| وثيقة إلزامي منفردة (1200₪) | دفعة مقفلة 1200₪ |
| باقة مع إلزامي كإضافة (1200₪) | دفعة مقفلة 1200₪ |
| باقة بدون إلزامي | لا توجد دفعات مقفلة |
| تغيير سعر الإلزامي | تحديث الدفعة المقفلة |
| إلغاء تفعيل الإلزامي | إزالة الدفعة المقفلة |

