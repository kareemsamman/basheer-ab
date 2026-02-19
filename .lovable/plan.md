# إصلاح: ترتيب المصروفات بالأحدث أولاً + عرض وقت الإنشاء

## المشكلة

الترتيب الحالي يعتمد على `expense_date` فقط. عندما يكون هناك عدة سندات بنفس التاريخ (مثل 19/02)، لا يوجد ترتيب ثانوي بحسب وقت الإنشاء. كذلك لا يُعرض وقت إنشاء السند في الجدول.

## الحل

### 1. ترتيب ثانوي بوقت الإنشاء

تعديل الترتيب في سطر 319 ليشمل `created_at` كمعيار ثانوي:

- عند تساوي `expense_date`، يُرتب بحسب `created_at` تنازلياً (الأحدث أولاً)

### 2. إضافة عمود "وقت الإنشاء" في الجدول

إضافة عمود جديد بعد عمود "التاريخ" يعرض تاريخ ووقت الإنشاء بصيغة `DD/MM/YYYY HH:mm`

---

## التفاصيل التقنية

### ملف: `src/pages/Expenses.tsx`

**1. تعديل الترتيب (سطر 319):**

```js
allExpenses.sort((a, b) => {
  const dateDiff = new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
});
```

**2. إضافة عمود "وقت الإنشاء" في TableHeader (بعد سطر 685 "التاريخ"):**

```jsx
<TableHead>وقت الإنشاء</TableHead>
```

**3. إضافة خلية الوقت في TableBody (بعد سطر 736 خلية التاريخ):**

```jsx
<TableCell className="text-sm text-muted-foreground whitespace-nowrap">
  {format(new Date(expense.created_at), 'dd/MM/yyyy HH:mm')}
</TableCell>
```

**4. ضمان أن `created_at` للسندات المولّدة من بوليصات تأخذ القيمة الفعلية:**
حالياً السندات المحوّلة من `policy_payments` و`policies` تستخدم `payment_date`/`start_date` كقيمة `created_at`. هذا غير دقيق. لكن بما أن هذه السندات لا تحتوي على `created_at` حقيقي في الاستعلام، سنبقيها كما هي (التاريخ نفسه) لأنها بيانات مولّدة وليست مدخلة يدوياً.

### لا تغييرات في قاعدة البيانات  
  
the ab want a way to see who also did that which worker or admin name and  he want to add start date to end date also 