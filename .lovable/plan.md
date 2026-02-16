

# إصلاح حساب المستحق للشركة لأنواع السيارات غير المعرّفة

## المشكلة
سيارة جودت سدر (4306931) نوعها `tjeradown4` (تجاري > 4 طن)، لكن قواعد التسعير لشركة "اراضي مقدسة" معرّفة فقط لنوع `car`. الدالة `getRuleValue` تطلب تطابق نوع السيارة بالضبط، فلا تجد أي قاعدة → المستحق للشركة = 0 والربح = كامل السعر.

**النتيجة الصحيحة:** المستحق للشركة = 900₪ (سعر الطرف الثالث) والربح = 3,400₪

## الحل

### ملف `src/lib/pricingCalculator.ts` - تعديل دالة `getRuleValue`

إضافة **fallback**: إذا لم يُوجد قاعدة تطابق نوع السيارة بالضبط، يتم البحث مرة أخرى بدون فلتر نوع السيارة (أي استخدام القواعد العامة كافتراضي).

```text
// المنطق الحالي (سطر 82-101):
const getRuleValue = (...) => {
  const matchingRules = rules?.filter(r => {
    if (matchCarType && r.car_type && r.car_type !== carType) return false;
    ...
  });
  return matchingRules[0]?.value ?? 0;
};

// بعد الإصلاح:
const getRuleValue = (...) => {
  // 1. محاولة أولى: تطابق دقيق مع نوع السيارة
  const exactMatch = rules?.filter(r => {
    if (r.rule_type !== ruleType) return false;
    if (matchCarType && r.car_type && r.car_type !== carType) return false;
    if (matchAgeBand && r.age_band && r.age_band !== 'ANY' && r.age_band !== ageBand) return false;
    return true;
  }) || [];
  
  // ترتيب حسب الدقة
  exactMatch.sort(...);
  if (exactMatch.length > 0) return exactMatch[0].value ?? 0;
  
  // 2. fallback: تجاهل نوع السيارة (استخدام القواعد العامة)
  if (matchCarType) {
    const fallback = rules?.filter(r => {
      if (r.rule_type !== ruleType) return false;
      if (matchAgeBand && r.age_band && r.age_band !== 'ANY' && r.age_band !== ageBand) return false;
      return true;
    }) || [];
    fallback.sort(...);
    if (fallback.length > 0) return fallback[0].value ?? 0;
  }
  
  return 0;
};
```

### النتيجة
- سيارة `tjeradown4` ستستخدم قواعد `car` كافتراضي (900₪ للطرف الثالث)
- أي نوع سيارة جديد بدون قواعد خاصة سيستخدم القواعد الموجودة بدل إرجاع 0
- لا حاجة لإضافة قواعد تسعير لكل نوع سيارة

