
# إصلاح: تاب "تم التجديد" لا يعرض البيانات

## المشكلة
الدالة `report_renewed_clients` في قاعدة البيانات تستخدم معاملات مختلفة عن الكود:

| الدالة SQL | الكود TypeScript |
|------------|------------------|
| `p_limit` | `p_page_size` ❌ |
| `p_offset` | `p_page` ❌ |

هذا يتسبب في فشل الاستعلام لأن المعاملات غير متطابقة.

---

## الحل

تعديل استدعاء الدالة في `PolicyReports.tsx`:

**قبل:**
```typescript
const { data, error } = await supabase.rpc('report_renewed_clients', {
  p_end_month: renewedMonth ? `${renewedMonth}-01` : null,
  p_policy_type: renewedPolicyTypeFilter !== 'all' ? renewedPolicyTypeFilter : null,
  p_created_by: renewedCreatedByFilter !== 'all' ? renewedCreatedByFilter : null,
  p_search: renewedSearch || null,
  p_page_size: PAGE_SIZE,      // ❌ خطأ
  p_page: renewedPage + 1       // ❌ خطأ
});
```

**بعد:**
```typescript
const { data, error } = await supabase.rpc('report_renewed_clients', {
  p_end_month: renewedMonth ? `${renewedMonth}-01` : null,
  p_policy_type: renewedPolicyTypeFilter !== 'all' ? renewedPolicyTypeFilter : null,
  p_created_by: renewedCreatedByFilter !== 'all' ? renewedCreatedByFilter : null,
  p_search: renewedSearch || null,
  p_limit: PAGE_SIZE,                    // ✅ صحيح
  p_offset: renewedPage * PAGE_SIZE      // ✅ صحيح
});
```

---

## الملف المتأثر

| الملف | التغيير |
|-------|---------|
| `src/pages/PolicyReports.tsx` | تصحيح أسماء المعاملات |

---

## الاختبار

1. افتح **تقارير الوثائق → تم التجديد**
2. تأكد أن البيانات تظهر بدون رسالة خطأ
3. جرب تغيير الشهر والفلاتر
