
# تحديث جدول الوثائق - تصحيح الأعمدة والعرض

## ملخص التغييرات

تحديث جدول الوثائق بناءً على الملاحظات:
1. تغيير "ملفات" إلى "رقم الملف" وعرض الرقم الفعلي (مثل F1019)
2. تغيير "المحتوى" إلى "التأمينات"
3. عرض التأمينات كأسطر متعددة مع اسم الشركة
4. تعديل عرض الأعمدة (تقليل التأمينات، زيادة الفترة)
5. عرض تواريخ متعددة للحزم ذات التواريخ المختلفة

---

## التغييرات التفصيلية

### 1. تغيير عمود "ملفات" → "رقم الملف"

| قبل | بعد |
|-----|------|
| `ملفات` | `رقم الملف` |
| رقم (1، 3، 12) | رقم الملف الفعلي (F1019) |

**مصدر البيانات:** `clients.file_number`

### 2. تغيير عمود "المحتوى" → "التأمينات"

| قبل | بعد |
|-----|------|
| `المحتوى` | `التأمينات` |
| شرائح متراصة أفقياً | أسطر متعددة |

### 3. تنسيق عمود التأمينات (الأهم)

**التنسيق الجديد:**
```
ثالث → اسم الشركة
خدمات الطريق → اسم الشركة
إلزامي → اسم الشركة
```

**القواعد:**
- كل تأمين في سطر منفصل
- استخدام السهم (→) كفاصل
- عرض اسم الشركة العربي إن وُجد

### 4. تعديل عرض الأعمدة

| العمود | قبل | بعد |
|--------|-----|------|
| التأمينات | `min-w-[160px]` | `min-w-[120px]` |
| الفترة | `w-[140px]` | `min-w-[180px]` |

### 5. منطق عمود الفترة (للحزم)

**الحالة 1: كل الوثائق بنفس التاريخ**
```
09/02/2027 ← 10/02/2026
```

**الحالة 2: تواريخ مختلفة**
```
09/02/2027 ← 10/02/2026
09/02/2027 ← 09/02/2026
15/03/2027 ← 15/03/2026
```

---

## التفاصيل التقنية

### الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/pages/Policies.tsx` | إضافة `file_number` للـ query |
| `src/components/policies/PolicyTableView.tsx` | تحديث الأعمدة والمنطق |
| `src/components/policies/cards/types.ts` | إضافة `file_number` للـ interface |

### تحديث الـ Query

```typescript
// في Policies.tsx
clients(id, full_name, phone_number, file_number, less_than_24, ...)
```

### تحديث الـ Interface

```typescript
// في types.ts
clients?: {
  id: string;
  full_name: string;
  less_than_24: boolean | null;
  phone_number?: string | null;
  file_number?: string | null;  // جديد
};
```

### دالة جديدة: `getInsuranceLines`

```typescript
// عرض التأمينات كأسطر
const getInsuranceLines = (group: PolicyGroup) => {
  const allPolicies = [
    ...(group.mainPolicy ? [group.mainPolicy] : []),
    ...group.addons,
  ];

  return allPolicies.map((policy) => {
    const label = policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child
      ? policyChildLabels[policy.policy_type_child]
      : policyTypeLabels[policy.policy_type_parent];
    
    const companyName = policy.insurance_companies?.name_ar 
      || policy.insurance_companies?.name 
      || '';
    
    return { label, companyName, policyId: policy.id };
  });
};
```

### دالة جديدة: `getDateRanges`

```typescript
// عرض التواريخ (سطر واحد أو متعدد)
const getDateRanges = (group: PolicyGroup) => {
  const allPolicies = [
    ...(group.mainPolicy ? [group.mainPolicy] : []),
    ...group.addons,
  ];

  // جمع التواريخ الفريدة
  const uniqueRanges = new Map<string, { start: string; end: string }>();
  
  allPolicies.forEach((policy) => {
    const key = `${policy.start_date}-${policy.end_date}`;
    if (!uniqueRanges.has(key)) {
      uniqueRanges.set(key, {
        start: formatDate(policy.start_date),
        end: formatDate(policy.end_date),
      });
    }
  });

  return Array.from(uniqueRanges.values());
};
```

### هيكل الجدول الجديد

```text
┌──────────┬──────────┬──────────────────────┬─────────┬──────────────────────┬───────┬...
│ رقم الملف│ العميل   │ التأمينات            │ السيارة │ الفترة               │الإجمالي│
├──────────┼──────────┼──────────────────────┼─────────┼──────────────────────┼───────┤
│ F1019    │ أحمد     │ ثالث → البيمة        │ 12-345  │ 09/02/2027 ← 10/02   │ ₪500  │
│          │ 050-xxx  │ إلزامي → مشرق        │         │                      │       │
│          │          │ خدمات طريق → البيمة  │         │                      │       │
├──────────┼──────────┼──────────────────────┼─────────┼──────────────────────┼───────┤
│ F1022    │ سارة     │ إلزامي → الشرق       │ 78-901  │ 15/03/2027 ← 15/03   │ ₪300  │
│          │ 052-xxx  │                      │         │ 10/02/2027 ← 10/02   │       │
│          │          │                      │         │ 01/01/2027 ← 01/01   │       │
└──────────┴──────────┴──────────────────────┴─────────┴──────────────────────┴───────┘
```

---

## خطوات التنفيذ

1. **تحديث `types.ts`** - إضافة `file_number` للـ interface
2. **تحديث `Policies.tsx`** - إضافة `file_number` للـ query
3. **تحديث `PolicyTableView.tsx`**:
   - تغيير عناوين الأعمدة
   - إضافة دالة `getInsuranceLines`
   - إضافة دالة `getDateRanges`
   - تحديث عرض الأعمدة
   - تعديل الـ JSX للعرض الجديد
