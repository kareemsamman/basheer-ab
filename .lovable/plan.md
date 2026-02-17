
# إصلاح: فلتر السيارة لا يعمل عند البحث والانتقال لعميل آخر

## المشكلة
عند البحث عن رقم سيارة (مثل 43126201) من شريط البحث السفلي والنقر على النتيجة، يتم الانتقال للعميل الصحيح مع فلتر السيارة في URL (`?car=carId`). لكن الفلتر لا يعمل -- يظهر "لا توجد وثائق تطابق معايير البحث" رغم وجود وثائق.

## السبب
`ClientDetails` يستخدم `useState(initialCarFilter || 'all')` لتهيئة فلتر السيارة. لكن `useState` يستخدم القيمة الأولية فقط عند **أول render**. عند الانتقال من عميل لآخر (المكون لا يُعاد تركيبه)، تتغير قيمة `initialCarFilter` لكن الـ state لا يتحدث.

## الحل

### ملف `src/components/clients/ClientDetails.tsx`
إضافة `useEffect` لمزامنة `initialCarFilter` مع `policyCarFilter`:

```text
useEffect(() => {
  setPolicyCarFilter(initialCarFilter || 'all');
}, [initialCarFilter]);
```

هذا يضمن أنه عند تغيير `initialCarFilter` (مثلاً عند البحث عن سيارة والانتقال لعميل جديد)، يتم تحديث فلتر السيارة تلقائياً.

### ملف `src/pages/Clients.tsx` (تحسين إضافي)
إضافة `key={viewingClient.id}` على مكون `ClientDetails` لإعادة تركيبه بالكامل عند تغيير العميل:

```text
<ClientDetails
  key={viewingClient.id}
  client={viewingClient}
  initialCarFilter={initialCarFilter}
  ...
/>
```

هذا يضمن إعادة تعيين جميع الحالات الداخلية (فلاتر، بحث، تبويبات) عند الانتقال لعميل مختلف.
