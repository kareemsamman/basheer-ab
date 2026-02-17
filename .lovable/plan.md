

# إصلاح: إخفاء الملحقات عند البحث

## المشكلة
عند البحث برقم هاتف أو أي نص في تقرير تسوية الشركة، الوثائق تُفلتر بشكل صحيح لكن الملحقات (settlement supplements) تظهر دائماً لأنها تُعرض بدون أي فلترة بحث.

## الحل

### ملف `src/pages/CompanySettlementDetail.tsx`
- فلترة الملحقات حسب نص البحث (searchQuery) تماماً كالوثائق
- عند وجود بحث نشط، الملحقات التي لا تطابق النص تُخفى

### التعديل:
في السطر ~1201 حيث تُعرض الملحقات، إضافة فلترة:

```text
// قبل:
{supplements.map((s) => (

// بعد:
{supplements.filter(s => {
  if (!searchQuery.trim()) return true;
  const q = searchQuery.toLowerCase();
  return (s.description || '').toLowerCase().includes(q) 
    || String(s.company_payment).includes(q)
    || String(s.insurance_price).includes(q);
}).map((s) => (
```

هذا يضمن أن الملحقات تُعامل بنفس طريقة الوثائق عند البحث.
