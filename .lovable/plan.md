

# خطة: إصلاح ظهور دفعة الإلزامي عند النقر المباشر على الخطوة 4

## المشكلة

عند إنشاء وثيقة جديدة مع إلزامي:
- النقر على زر "التالي" في الخطوة 3 → دفعة الإلزامي تظهر ✅
- النقر مباشرة على الخطوة 4 في الـ Stepper → دفعة الإلزامي لا تظهر ❌

## السبب

منطق إضافة دفعة الإلزامي المقفلة موجود فقط في دالة `handleNext` (السطور 318-377)، لكن النقر المباشر على الخطوة 4 يستخدم دالة `handleStepClick` التي تستدعي `goToStep` مباشرة دون تنفيذ هذا المنطق.

## الحل

إضافة نفس منطق ELZAMI إلى دالة `handleStepClick` عند الانتقال للخطوة 4.

---

## التغييرات المطلوبة

### الملف: `src/components/policies/PolicyWizard.tsx`

### تحديث دالة `handleStepClick` (السطور 257-270):

**الكود الحالي:**
```typescript
const handleStepClick = (stepId: number) => {
  if (stepId === currentStep) return;
  
  const step = steps.find(s => s.id === stepId);
  if (!step?.isUnlocked) return;

  if (stepId < currentStep) {
    goToStep(stepId);
  } else {
    if (validateStep(currentStep)) {
      goToStep(stepId);
    }
  }
};
```

**الكود الجديد:**
```typescript
const handleStepClick = (stepId: number) => {
  if (stepId === currentStep) return;
  
  const step = steps.find(s => s.id === stepId);
  if (!step?.isUnlocked) return;

  if (stepId < currentStep) {
    goToStep(stepId);
  } else {
    if (validateStep(currentStep)) {
      // Apply ELZAMI payment logic when navigating to Step 4
      if (stepId === 4) {
        applyElzamiPaymentLogic();
      }
      goToStep(stepId);
    }
  }
};
```

### إضافة دالة مشتركة `applyElzamiPaymentLogic`:

استخراج منطق ELZAMI إلى دالة منفصلة يمكن استدعاؤها من كلا المكانين:

```typescript
// Shared function to handle ELZAMI payment logic
const applyElzamiPaymentLogic = () => {
  const isMainElzami = policy.policy_type_parent === 'ELZAMI';
  const elzamiAddon = packageAddons.find(a => a.type === 'elzami' && a.enabled);
  const isAddonElzami = packageMode && elzamiAddon?.enabled;
  const hasLockedElzamiPayment = payments.some(p => p.locked && p.source === 'system');
  
  if (isMainElzami || isAddonElzami) {
    const elzamiPrice = isMainElzami 
      ? parseFloat(policy.insurance_price) || pricing.totalPrice
      : parseFloat(elzamiAddon?.insurance_price || '0');
    
    if (elzamiPrice > 0) {
      const elzamiDate = isAddonElzami && elzamiAddon?.start_date
        ? elzamiAddon.start_date
        : policy.start_date || new Date().toISOString().split('T')[0];
      
      if (!hasLockedElzamiPayment) {
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
      } else {
        const lockedPayment = payments.find(p => p.locked && p.source === 'system');
        if (lockedPayment && lockedPayment.amount !== elzamiPrice) {
          setPayments(payments.map(p => 
            p.locked && p.source === 'system' 
              ? { ...p, amount: elzamiPrice, payment_date: elzamiDate }
              : p
          ));
        }
      }
    }
  } else if (hasLockedElzamiPayment) {
    setPayments(payments.filter(p => !(p.locked && p.source === 'system')));
  }
};
```

### تحديث `handleNext` لاستخدام الدالة المشتركة:

```typescript
const handleNext = () => {
  if (!validateStep(currentStep)) return;
  const nextStep = Math.min(currentStep + 1, steps.length);
  
  // Apply ELZAMI payment logic when entering Step 4
  if (nextStep === 4) {
    applyElzamiPaymentLogic();
  }
  
  goToStep(nextStep);
};
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/policies/PolicyWizard.tsx` | استخراج منطق ELZAMI لدالة مشتركة + تحديث `handleStepClick` |

---

## النتيجة المتوقعة

| السيناريو | قبل | بعد |
|-----------|-----|-----|
| النقر على "التالي" في الخطوة 3 | دفعة الإلزامي تظهر ✅ | دفعة الإلزامي تظهر ✅ |
| النقر مباشرة على الخطوة 4 | دفعة الإلزامي لا تظهر ❌ | دفعة الإلزامي تظهر ✅ |
| تغيير سعر الإلزامي والعودة للخطوة 4 | يتم تحديث السعر ✅ | يتم تحديث السعر ✅ |

