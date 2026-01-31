
# خطة: نظام إنشاء بلاغات الحوادث (Create Accident Report)

## الهدف
إنشاء نظام متكامل لإنشاء بلاغات الحوادث يتيح:
1. اختيار العميل من قائمة البحث
2. عرض وثائق العميل ككاردات (مثل صفحة الملف الشخصي)
3. اختيار الوثيقة المناسبة مع منطق خاص للباقات
4. عرض قالب PDF الخاص بشركة التأمين
5. إضافة تبويب "قالب البلاغ" لشركات الخدمات (مثل Company X)
6. إمكانية إنشاء بلاغ من صفحة العميل مباشرة

---

## تحليل الوضع الحالي

### الموجود:
- صفحة `/accidents` تعرض قائمة البلاغات الموجودة
- صفحة `/policies/:policyId/accident/:reportId?` لتعبئة تفاصيل البلاغ
- أداة تعيين قالب البلاغ `/admin/accident-template-mapper/:companyId`
- جدول `company_accident_templates` لتخزين قوالب الشركات
- Edge Function `generate-accident-pdf` لإنشاء البلاغ كـ HTML تفاعلي
- مكون `AccidentTemplateDrawer` لإدارة قوالب شركات THIRD_FULL

### المفقود:
- زر "بلاغ جديد" في صفحة `/accidents`
- نظام اختيار العميل → الوثيقة → الشركة
- منطق استبعاد الإلزامي وعرض خيارات الباقة
- إمكانية إنشاء بلاغ من صفحة العميل
- تبويب "قالب البلاغ" لشركات ROAD_SERVICE

---

## التعديلات المطلوبة

### 1) مكون جديد: AccidentReportWizard
**ملف:** `src/components/accident-reports/AccidentReportWizard.tsx`

**الوظيفة:** Drawer متعدد الخطوات لإنشاء بلاغ جديد

**الخطوات:**
1. **اختيار العميل**: بحث بالاسم/الهوية/الهاتف → عرض نتائج → اختيار
2. **عرض الوثائق**: كاردات مشابهة لـ `PolicyTreeView` لكن مع فلترة:
   - استبعاد ELZAMI دائماً
   - عرض THIRD_FULL, ROAD_SERVICE, ACCIDENT_FEE_EXEMPTION
3. **اختيار الوثيقة**:
   - إذا وثيقة مفردة → اختيار مباشر
   - إذا باقة (group_id) → عرض dropdown لاختيار أي وثيقة من الباقة (استبعاد ELZAMI)
4. **التوجيه**: بعد الاختيار → فتح صفحة `/policies/:policyId/accident/new`

**المنطق التقني:**
```typescript
// فلترة الوثائق للبلاغات
const eligiblePolicies = policies.filter(p => {
  // استبعاد الملغية والمحولة
  if (p.cancelled || p.transferred) return false;
  // استبعاد الإلزامي
  if (p.policy_type_parent === 'ELZAMI') return false;
  // قبول: THIRD_FULL, ROAD_SERVICE, ACCIDENT_FEE_EXEMPTION
  return ['THIRD_FULL', 'ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION'].includes(p.policy_type_parent);
});

// تجميع حسب الباقة
const grouped = groupPoliciesByGroupId(eligiblePolicies);
```

### 2) تحديث صفحة AccidentReports
**ملف:** `src/pages/AccidentReports.tsx`

**التعديلات:**
- إضافة زر "بلاغ جديد +"
- دمج مكون `AccidentReportWizard`

```tsx
// في الـ Header
<Button onClick={() => setWizardOpen(true)}>
  <Plus className="h-4 w-4 ml-2" />
  بلاغ جديد
</Button>

// في نهاية الملف
<AccidentReportWizard
  open={wizardOpen}
  onOpenChange={setWizardOpen}
/>
```

### 3) تحديث صفحة ClientDetails
**ملف:** `src/components/clients/ClientDetails.tsx`

**التعديلات:**
- إضافة زر "إنشاء بلاغ" في قسم الإجراءات
- دمج `AccidentReportWizard` مع تمرير العميل المحدد مسبقاً

```tsx
// زر جديد في الأكشن بار
<Button 
  variant="outline" 
  onClick={() => setAccidentWizardOpen(true)}
>
  <AlertTriangle className="h-4 w-4 ml-2" />
  إنشاء بلاغ
</Button>

// مكون الـ Wizard مع تمرير العميل
<AccidentReportWizard
  open={accidentWizardOpen}
  onOpenChange={setAccidentWizardOpen}
  preselectedClient={client}  // يتخطى خطوة اختيار العميل
/>
```

### 4) مكون جديد: PolicySelectionCards
**ملف:** `src/components/accident-reports/PolicySelectionCards.tsx`

**الوظيفة:** عرض وثائق العميل ككاردات قابلة للنقر مع منطق الباقات

**الميزات:**
- نفس تصميم كاردات `PolicyTreeView`
- Badge للنوع (ثالث/شامل، خدمات طريق، إعفاء رسوم)
- Badge للحالة (سارية، منتهية)
- عرض اسم الشركة وتاريخ الوثيقة
- للباقات: عرض dropdown لاختيار الوثيقة المحددة

### 5) تحديث صفحة Companies
**ملف:** `src/pages/Companies.tsx`

**التعديلات:**
- إظهار زر "قالب البلاغ" لشركات ROAD_SERVICE أيضاً (وليس فقط THIRD_FULL)

```tsx
// تعديل الشرط من:
{company.category_parent?.includes('THIRD_FULL') && (
  <Button onClick={() => handleManageAccidentTemplate(company)}>
    قالب البلاغ
  </Button>
)}

// إلى:
{(company.category_parent?.includes('THIRD_FULL') || 
  company.category_parent?.includes('ROAD_SERVICE')) && (
  <Button onClick={() => handleManageAccidentTemplate(company)}>
    قالب البلاغ
  </Button>
)}
```

---

## مخطط سير العمل

```text
┌─────────────────────────────────────────────────────────────────┐
│                    صفحة بلاغات الحوادث                          │
│                                                                 │
│  [+ بلاغ جديد]                                                  │
│       ↓                                                         │
│  ┌───────────────────────────────────────┐                     │
│  │ Drawer: اختيار العميل                 │                     │
│  │ • بحث بالاسم/الهوية/الهاتف           │                     │
│  │ • عرض نتائج البحث                    │                     │
│  │ • [اختيار عميل]                      │                     │
│  └───────────────────────────────────────┘                     │
│       ↓                                                         │
│  ┌───────────────────────────────────────┐                     │
│  │ عرض وثائق العميل (كاردات)            │                     │
│  │ • فلترة: THIRD_FULL, ROAD_SERVICE,   │                     │
│  │   ACCIDENT_FEE_EXEMPTION              │                     │
│  │ • استبعاد: ELZAMI                     │                     │
│  │ • [اختيار وثيقة]                      │                     │
│  └───────────────────────────────────────┘                     │
│       ↓                                                         │
│  ┌───────────────────────────────────────┐                     │
│  │ إذا باقة: اختيار الوثيقة من الباقة   │                     │
│  │ مثال: طرف ثالث / خدمات طريق          │                     │
│  │ (استبعاد الإلزامي)                    │                     │
│  └───────────────────────────────────────┘                     │
│       ↓                                                         │
│  توجيه إلى: /policies/{policyId}/accident/new                  │
│  مع عرض قالب PDF الخاص بالشركة                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## الملفات المطلوب إنشاؤها/تعديلها

| الملف | النوع | الوصف |
|-------|-------|-------|
| `src/components/accident-reports/AccidentReportWizard.tsx` | جديد | Drawer لإنشاء بلاغ |
| `src/components/accident-reports/PolicySelectionCards.tsx` | جديد | كاردات اختيار الوثائق |
| `src/pages/AccidentReports.tsx` | تعديل | إضافة زر + دمج Wizard |
| `src/components/clients/ClientDetails.tsx` | تعديل | إضافة زر إنشاء بلاغ |
| `src/pages/Companies.tsx` | تعديل | إظهار قالب البلاغ لـ ROAD_SERVICE |

---

## التفاصيل التقنية

### منطق الباقات:
```typescript
interface PolicyGroup {
  groupId: string | null;
  policies: Policy[];
  mainPolicy: Policy | null;  // THIRD_FULL or ELZAMI
}

// عند اختيار باقة:
// 1. استخراج جميع الوثائق بنفس group_id
// 2. استبعاد ELZAMI
// 3. إذا وثيقة واحدة → اختيار تلقائي
// 4. إذا أكثر من وثيقة → عرض dropdown
```

### واجهة مكون AccidentReportWizard:
```typescript
interface AccidentReportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedClient?: {
    id: string;
    full_name: string;
  } | null;  // للاستخدام من صفحة العميل
}
```

### فلترة الوثائق:
```typescript
const ACCIDENT_ELIGIBLE_TYPES = [
  'THIRD_FULL',
  'ROAD_SERVICE', 
  'ACCIDENT_FEE_EXEMPTION'
];

const eligiblePolicies = allPolicies.filter(p => 
  !p.cancelled && 
  !p.transferred &&
  ACCIDENT_ELIGIBLE_TYPES.includes(p.policy_type_parent)
);
```
