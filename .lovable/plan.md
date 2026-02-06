
# خطة تحسين صفحة الوثائق

## ملخص المتطلبات
1. عرض الوثائق كـ Cards (بطاقات) بدلاً من جدول - مثل تصميم PolicyTreeView
2. تمييز الباقات (Packages) عن الوثائق المفردة
3. إضافة فلترة بالتاريخ (من - إلى)
4. إضافة خيارات سريعة: "هذا الشهر"، "اختيار سنة"، "تاريخ مخصص"

---

## التغييرات المطلوبة

### 1. تحديث واجهة الفلترة (PolicyFilters.tsx)

إضافة حقول جديدة:
- **الفترة الزمنية**: اختيار سريع (الكل، اليوم، هذا الشهر، الشهر الماضي، مخصص)
- **من تاريخ / إلى تاريخ**: باستخدام ArabicDatePicker
- **السنة**: اختيار سنة محددة (2024، 2025، 2026...)

```text
┌─────────────────────────────────────────────────────────┐
│  الفترة: [الكل ▼] [هذا الشهر ▼] [السنة: 2026 ▼]         │
│                                                          │
│  من تاريخ: [DD/MM/YYYY 📅]  إلى تاريخ: [DD/MM/YYYY 📅]  │
└─────────────────────────────────────────────────────────┘
```

### 2. تحديث صفحة Policies.tsx

#### أ. استبدال Table بـ Cards
- استخدام تصميم مشابه لـ `PolicyTreeView`
- عرض الوثائق المفردة بتصميم بسيط
- عرض الباقات بتصميم قابل للتوسيع يُظهر المكونات

#### ب. تجميع الوثائق حسب group_id
- الوثائق ذات نفس group_id تُعرض كباقة واحدة
- عند التوسيع تظهر تفاصيل كل وثيقة

#### ج. إضافة فلترة التاريخ
تحديث الـ state:
```typescript
const [filters, setFilters] = useState<PolicyFilterValues>({
  policyType: 'all',
  companyId: 'all',
  status: 'all',
  brokerId: 'all',
  creatorId: 'all',
  branchId: 'all',
  datePreset: 'all',      // جديد
  dateFrom: '',           // جديد
  dateTo: '',             // جديد
  year: 'all',            // جديد
});
```

تحديث الـ query:
```typescript
// فلترة بتاريخ الإنشاء
if (filters.dateFrom) {
  query = query.gte('created_at', filters.dateFrom);
}
if (filters.dateTo) {
  query = query.lte('created_at', filters.dateTo + 'T23:59:59');
}
// فلترة بالسنة
if (filters.year !== 'all') {
  query = query
    .gte('created_at', `${filters.year}-01-01`)
    .lte('created_at', `${filters.year}-12-31T23:59:59`);
}
```

### 3. تصميم البطاقة الجديدة

#### بطاقة الباقة (Package):
```text
┌────────────────────────────────────────────────────────────────────┐
│ ▶ [باقة 📦] [ثالث] + [إلزامي] + [خدمات طريق]  [متبقي ₪2,300]     │
│                                                                    │
│  🏢 الشركة        🚗 السيارة      📅 الفترة                المبلغ   │
│  اراضي مقدسة      12345678        02/02/2026 ← 02/02/2027  ₪2,300  │
│                                                                    │
│  📦 مكونات الباقة                                                  │
│  ├─ [ثالث] اراضي مقدسة  02/02/2026 ← 02/02/2027  ₪1,000           │
│  ├─ [إلزامي] منورا      02/02/2026 ← 02/02/2027  ₪1,000           │
│  └─ [خدمات طريق] شركة X 02/02/2026 ← 02/02/2027  ₪300             │
│                                                                    │
│  📝 ملاحظات: تحويل من سيارة 21212121 - إضافة ضمن باقة             │
│                                                    [⋮] [✈] [دفع]   │
└────────────────────────────────────────────────────────────────────┘
```

#### بطاقة الوثيقة المفردة:
```text
┌────────────────────────────────────────────────────────────────────┐
│ [ثالث/شامل] [✓ مدفوع] [✓ سارية]                                   │
│                                                                    │
│  🏢 الشركة        🚗 السيارة      📅 الفترة                المبلغ   │
│  منورا            21212121        02/02/2026 ← 02/02/2027  ₪2,400  │
│                                                                    │
│  📝 ملاحظات: لا توجد ملاحظات - اضغط للإضافة                        │
│                                                         [⋮] [✈]   │
└────────────────────────────────────────────────────────────────────┘
```

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `src/pages/Policies.tsx` | تعديل كبير - استبدال Table بـ Cards |
| `src/components/policies/PolicyFilters.tsx` | إضافة فلترة التاريخ |
| `src/components/policies/PolicyCard.tsx` | مكون جديد |
| `src/components/policies/PolicyPackageCard.tsx` | مكون جديد |

---

## التفاصيل التقنية

### PolicyFilterValues الجديد:
```typescript
export interface PolicyFilterValues {
  policyType: string;
  companyId: string;
  status: string;
  brokerId: string;
  creatorId: string;
  branchId: string;
  // فلاتر التاريخ الجديدة
  datePreset: 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom';
  dateFrom: string;
  dateTo: string;
  year: string;
}
```

### خيارات الفترة الزمنية:
- **الكل**: بدون فلترة بالتاريخ
- **اليوم**: created_at = today
- **هذا الأسبوع**: من بداية الأسبوع للآن
- **هذا الشهر**: من بداية الشهر للآن
- **الشهر الماضي**: الشهر السابق كاملاً
- **مخصص**: إظهار حقول من/إلى

### تجميع الباقات:
```typescript
// نفس منطق PolicyTreeView
const groupedPolicies = useMemo(() => {
  const groups: Map<string, PolicyGroup> = new Map();
  
  policies.forEach(policy => {
    if (policy.group_id) {
      // إضافة للباقة
      if (!groups.has(policy.group_id)) {
        groups.set(policy.group_id, {
          groupId: policy.group_id,
          mainPolicy: null,
          addons: [],
          client: policy.clients,
          // ...
        });
      }
      // منطق تحديد الوثيقة الرئيسية
    } else {
      // وثيقة مفردة
      groups.set(`standalone-${policy.id}`, {
        groupId: null,
        mainPolicy: policy,
        addons: [],
        // ...
      });
    }
  });
  
  return Array.from(groups.values());
}, [policies]);
```

---

## سير العمل

```text
1. المستخدم يفتح صفحة الوثائق
2. يختار الفترة الزمنية (هذا الشهر، سنة معينة، أو مخصص)
3. الوثائق تُعرض كبطاقات:
   - الباقات مُجمّعة مع إمكانية التوسيع
   - الوثائق المفردة بتصميم بسيط
4. عند الضغط على بطاقة تفتح تفاصيل الوثيقة
5. أزرار الإجراءات (دفع، إرسال، المزيد) متاحة مباشرة
```

---

## ملاحظات
- استخدام نفس تصميم PolicyTreeView للحفاظ على التناسق
- الفلترة بالتاريخ على created_at وليس start_date
- دعم فلترة بالسنة للتقارير السنوية
- الحفاظ على الأداء عبر server-side pagination
