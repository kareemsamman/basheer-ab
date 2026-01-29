
# خطة إصلاح مشاكل إنشاء الوثائق وتابعين السائقين

## المشاكل المحددة

### 1. الوثيقة الجديدة لا تظهر فوراً
**السبب**: بعد إنشاء الوثيقة، يتم استدعاء `onSaved?.()` بتأخير 150ms، لكن صفحة العميل لا تقوم بإعادة جلب البيانات فوراً.

### 2. معلومات السائقين/التابعين غير ظاهرة
**السبب**: 
- تفاصيل الوثيقة (PolicyDetailsDrawer) لا تعرض السائقين المرتبطين بالوثيقة
- تقرير العميل الشامل لا يجلب أو يعرض بيانات policy_children
- رسائل SMS لا تتضمن معلومات السائقين

### 3. عدم إمكانية تعديل التابعين في الملف الشخصي
**السبب**: مكون `ClientChildrenManager` يعرض التابعين لكن لا يوفر إمكانية تعديلهم (فقط إضافة وحذف)

### 4. خيار "سائق إضافي (ابن/ابنة) أقل من 24" غير مطلوب
**الحل**: إزالته وإبقاء خيارين فقط:
- لا
- نعم – العميل نفسه أقل من 24

### 5. مشاكل RTL في مجموعة الراديو
**السبب**: استخدام `dir="ltr"` و `space-x-reverse` في تخطيط أزرار الراديو

---

## التغييرات المطلوبة

### الجزء 1: إصلاح التحديث الفوري للوثائق

| الملف | التغيير |
|------|---------|
| `src/components/clients/ClientDetails.tsx` | تعديل `handlePolicyWizardComplete` لاستدعاء `fetchPolicies()` و `fetchPaymentSummary()` فوراً بعد إغلاق المعالج |

### الجزء 2: عرض التابعين في تفاصيل الوثيقة

| الملف | التغيير |
|------|---------|
| `src/components/policies/PolicyDetailsDrawer.tsx` | إضافة جلب `policy_children` وعرضهم في قسم جديد "السائقين الإضافيين" |

### الجزء 3: إضافة التابعين لتقرير العميل الشامل

| الملف | التغيير |
|------|---------|
| `supabase/functions/generate-client-report/index.ts` | جلب `policy_children` لكل وثيقة وعرض أسمائهم في بطاقة الوثيقة |

### الجزء 4: تعديل خيارات "أقل من 24" في ملف العميل

| الملف | التغيير |
|------|---------|
| `src/components/clients/ClientDrawer.tsx` | إزالة خيار `additional_driver` من `UNDER24_OPTIONS` وتبسيط الخيارات لخيارين فقط |
| Schema validation | إزالة `additional_driver` من enum |

### الجزء 5: إضافة تعديل التابعين في الملف الشخصي

| الملف | التغيير |
|------|---------|
| `src/components/clients/ClientChildrenManager.tsx` | إضافة زر تعديل لكل تابع موجود مع نموذج تعديل مضمن |

### الجزء 6: إصلاح RTL لمجموعة الراديو

| الملف | التغيير |
|------|---------|
| `src/components/clients/ClientDrawer.tsx` | إزالة `space-x-reverse` من divs وإزالة أي `dir="ltr"` |

---

## التفاصيل التقنية

### 1. تحديث تفاصيل الوثيقة لعرض التابعين

```typescript
// في PolicyDetailsDrawer.tsx - إضافة fetch للأطفال
const [policyChildren, setPolicyChildren] = useState<any[]>([]);

// ضمن fetchPolicyDetails:
const { data: childrenData } = await supabase
  .from('policy_children')
  .select(`
    id,
    child:client_children(
      id, full_name, id_number, relation, phone
    )
  `)
  .eq('policy_id', policyId);

setPolicyChildren(childrenData || []);
```

### 2. عرض قسم السائقين الإضافيين

```html
<!-- قسم جديد في PolicyDetailsDrawer -->
{policyChildren.length > 0 && (
  <Section title="السائقين الإضافيين" icon={Users}>
    <div className="space-y-2">
      {policyChildren.map(pc => (
        <div key={pc.id} className="p-3 bg-muted/50 rounded-lg">
          <p className="font-medium">{pc.child.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {pc.child.id_number} • {pc.child.relation}
          </p>
        </div>
      ))}
    </div>
  </Section>
)}
```

### 3. تبسيط خيارات أقل من 24

```typescript
// من:
const UNDER24_OPTIONS = [
  { value: 'none', label: 'لا' },
  { value: 'client', label: 'نعم – العميل نفسه أقل من 24' },
  { value: 'additional_driver', label: 'نعم – سائق إضافي (ابن/ابنة) أقل من 24' },
]

// إلى:
const UNDER24_OPTIONS = [
  { value: 'none', label: 'لا' },
  { value: 'client', label: 'نعم – العميل أقل من 24' },
]
```

### 4. إصلاح RTL

```html
<!-- من: -->
<div className="flex items-center space-x-2 space-x-reverse">

<!-- إلى: -->
<div className="flex items-center gap-2">
```

---

## ملخص الملفات المتأثرة

1. `src/components/clients/ClientDetails.tsx` - تحديث فوري
2. `src/components/clients/ClientDrawer.tsx` - تبسيط خيارات + RTL
3. `src/components/clients/ClientChildrenManager.tsx` - إضافة تعديل
4. `src/components/policies/PolicyDetailsDrawer.tsx` - عرض التابعين
5. `supabase/functions/generate-client-report/index.ts` - التابعين في التقرير

## النتائج المتوقعة

- ✅ الوثيقة تظهر فور إنشائها بدون تحديث
- ✅ التابعين يظهرون في تفاصيل الوثيقة
- ✅ تقرير العميل يتضمن معلومات السائقين لكل وثيقة
- ✅ خيارات "أقل من 24" مبسطة (خياران فقط)
- ✅ إمكانية تعديل التابعين من ملف العميل
- ✅ تخطيط RTL صحيح بدون انقلاب
