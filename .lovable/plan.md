
# خطة: ميزة تجديد الوثيقة / الباقة

## الهدف

إضافة زر "تجديد" يفتح معالج الوثيقة الجديدة مع تعبئة جميع البيانات تلقائياً من الوثيقة الحالية (العميل، السيارة، السائقين الإضافيين، تفاصيل الوثيقة، الملفات).

## آلية العمل

```text
┌─────────────────────────────────────────────────────────────────┐
│ المستخدم ينقر "تجديد الباقة" / "تجديد الوثيقة"                  │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ يفتح PolicyWizard مع بيانات مملوءة مسبقاً:                      │
│ ✓ الخطوة 1: العميل محدد + نوع التأمين                           │
│ ✓ الخطوة 2: السيارة محددة + السائقين الإضافيين                   │
│ ✓ الخطوة 3: الشركة + الأسعار + التواريخ الجديدة                  │
│ ✗ الخطوة 4: الدفعات (فارغة - للإدخال)                           │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ المستخدم يمكنه:                                                  │
│ • تغيير التواريخ (start_date, end_date)                         │
│ • تغيير الأسعار                                                 │
│ • إضافة دفعات جديدة                                             │
│ • حفظ كوثيقة جديدة                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## التغييرات المطلوبة

### 1. تحديث واجهة PolicyWizard لدعم "التجديد"

**الملف:** `src/components/policies/PolicyWizard.tsx`

إضافة prop جديد `renewalData`:

```typescript
interface RenewalData {
  clientId: string;
  carId?: string | null;
  categorySlug: string;
  policyTypeParent: string;
  policyTypeChild?: string | null;
  companyId: string;
  insurancePrice: number;
  brokerBuyPrice?: number | null;
  notes?: string | null;
  // Package addons
  packageAddons?: {
    type: string;
    companyId: string;
    insurancePrice: number;
    roadServiceId?: string;
    accidentFeeServiceId?: string;
    policyTypeChild?: string;
  }[];
  // Additional drivers
  childrenIds?: string[];
}

interface PolicyWizardProps {
  // ... existing props
  renewalData?: RenewalData;
}
```

---

### 2. تحديث usePolicyWizardState لمعالجة بيانات التجديد

**الملف:** `src/components/policies/wizard/usePolicyWizardState.ts`

إضافة معالجة `renewalData`:

```typescript
interface UsePolicyWizardStateProps {
  // ... existing props
  renewalData?: RenewalData;
}

// Inside the hook:
useEffect(() => {
  if (!renewalData || !open) return;
  
  // Auto-populate from renewal data:
  // 1. Fetch and select client
  // 2. Fetch and select car
  // 3. Set category by slug
  // 4. Set policy form with company, price, dates (shifted +1 year)
  // 5. Populate package addons if any
  // 6. Set selected children IDs
}, [renewalData, open]);
```

**منطق التواريخ:**
- `start_date` = تاريخ اليوم أو `end_date` الأصلي + يوم واحد
- `end_date` = `start_date` + سنة - يوم واحد

---

### 3. إضافة زر "تجديد" في القائمة المنسدلة

**الملف:** `src/components/clients/PolicyYearTimeline.tsx`

في `DropdownMenuContent` (السطر 967):

```tsx
{/* Renew action - for active and ended policies */}
{(isActive || pkg.status === 'ended') && !isTransferred && !isCancelled && (
  <>
    <DropdownMenuSeparator />
    {isPkg && onRenewPackage && (
      <DropdownMenuItem onClick={() => onRenewPackage(pkg.allPolicyIds)}>
        <RefreshCw className="h-4 w-4 ml-2" />
        تجديد الباقة
      </DropdownMenuItem>
    )}
    {!isPkg && onRenewPolicy && (
      <DropdownMenuItem onClick={() => onRenewPolicy(policy.id)}>
        <RefreshCw className="h-4 w-4 ml-2" />
        تجديد الوثيقة
      </DropdownMenuItem>
    )}
  </>
)}
```

تحديث `PolicyYearTimelineProps`:

```typescript
interface PolicyYearTimelineProps {
  // ... existing props
  onRenewPolicy?: (policyId: string) => void;
  onRenewPackage?: (policyIds: string[]) => void;
}
```

---

### 4. إضافة منطق التجديد في ClientDetails

**الملف:** `src/components/clients/ClientDetails.tsx`

إضافة state ومعالجات جديدة:

```typescript
const [renewalData, setRenewalData] = useState<RenewalData | null>(null);

const handleRenewPolicy = async (policyId: string) => {
  // Fetch policy details
  const { data: policy } = await supabase
    .from('policies')
    .select(`
      *,
      policy_children(child_id)
    `)
    .eq('id', policyId)
    .single();
  
  if (!policy) return;
  
  // Find category by policy_type_parent
  const { data: category } = await supabase
    .from('insurance_categories')
    .select('slug')
    .eq('slug', policy.policy_type_parent === 'ELZAMI' || 
                policy.policy_type_parent === 'THIRD_FULL' 
                ? 'THIRD_FULL' : policy.policy_type_parent)
    .single();
  
  setRenewalData({
    clientId: policy.client_id,
    carId: policy.car_id,
    categorySlug: category?.slug || 'THIRD_FULL',
    policyTypeParent: policy.policy_type_parent,
    policyTypeChild: policy.policy_type_child,
    companyId: policy.company_id,
    insurancePrice: policy.insurance_price,
    notes: policy.notes,
    childrenIds: policy.policy_children?.map(pc => pc.child_id) || [],
  });
  
  setWizardOpen(true);
};

const handleRenewPackage = async (policyIds: string[]) => {
  // Fetch all policies in the package
  const { data: policies } = await supabase
    .from('policies')
    .select('*, policy_children(child_id)')
    .in('id', policyIds);
  
  if (!policies?.length) return;
  
  // Find main policy (THIRD_FULL or ELZAMI)
  const mainPolicy = policies.find(p => 
    p.policy_type_parent === 'THIRD_FULL' || p.policy_type_parent === 'ELZAMI'
  ) || policies[0];
  
  // Build addons from other policies
  const addons = policies
    .filter(p => p.id !== mainPolicy.id)
    .map(p => ({
      type: p.policy_type_parent.toLowerCase(),
      companyId: p.company_id,
      insurancePrice: p.insurance_price,
      roadServiceId: p.road_service_id,
      policyTypeChild: p.policy_type_child,
    }));
  
  // Collect all children IDs
  const allChildrenIds = [...new Set(
    policies.flatMap(p => p.policy_children?.map(pc => pc.child_id) || [])
  )];
  
  setRenewalData({
    clientId: mainPolicy.client_id,
    carId: mainPolicy.car_id,
    categorySlug: 'THIRD_FULL',
    policyTypeParent: mainPolicy.policy_type_parent,
    policyTypeChild: mainPolicy.policy_type_child,
    companyId: mainPolicy.company_id,
    insurancePrice: mainPolicy.insurance_price,
    notes: mainPolicy.notes,
    packageAddons: addons,
    childrenIds: allChildrenIds,
  });
  
  setWizardOpen(true);
};
```

تمرير الدوال إلى `PolicyYearTimeline`:

```tsx
<PolicyYearTimeline
  // ... existing props
  onRenewPolicy={handleRenewPolicy}
  onRenewPackage={handleRenewPackage}
/>
```

---

### 5. إضافة زر التجديد في PolicyDetailsDrawer

**الملف:** `src/components/policies/PolicyDetailsDrawer.tsx`

إضافة زر "تجديد" في شريط الأدوات (بجانب تحويل/إلغاء):

```tsx
<Button
  variant="outline"
  className="gap-2"
  onClick={handleRenewClick}
  disabled={policy.cancelled || policy.transferred}
>
  <RefreshCw className="h-4 w-4" />
  تجديد
</Button>
```

---

### 6. إضافة التجديد في صفحة تتبع الديون

**الملف:** `src/pages/DebtTracking.tsx`

في جدول العملاء، إضافة زر "تجديد" في القائمة المنسدلة:

```tsx
<DropdownMenuItem onClick={() => handleRenewFromDebt(client)}>
  <RefreshCw className="h-4 w-4 ml-2" />
  تجديد الوثائق
</DropdownMenuItem>
```

---

### 7. إضافة التجديد في صفحة التجديدات

**الملف:** `src/pages/PolicyReports.tsx`

في علامة تبويب "التجديدات"، إضافة زر "تجديد" في كل صف:

```tsx
<Button
  size="sm"
  variant="outline"
  className="gap-1"
  onClick={() => handleRenewClient(client)}
>
  <RefreshCw className="h-4 w-4" />
  تجديد
</Button>
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/policies/PolicyWizard.tsx` | إضافة prop `renewalData` |
| `src/components/policies/wizard/usePolicyWizardState.ts` | معالجة بيانات التجديد وتعبئة الفورم |
| `src/components/policies/wizard/types.ts` | إضافة `RenewalData` interface |
| `src/components/clients/PolicyYearTimeline.tsx` | إضافة زر تجديد في القائمة + props جديدة |
| `src/components/clients/ClientDetails.tsx` | إضافة handlers للتجديد |
| `src/components/policies/PolicyDetailsDrawer.tsx` | إضافة زر تجديد |
| `src/pages/DebtTracking.tsx` | إضافة خيار تجديد |
| `src/pages/PolicyReports.tsx` | إضافة زر تجديد في التجديدات |

---

## تدفق البيانات

```text
الوثيقة الأصلية                 الوثيقة المجددة
┌──────────────────┐           ┌──────────────────┐
│ client_id: X     │ ────────> │ client_id: X     │ (نفسه)
│ car_id: Y        │ ────────> │ car_id: Y        │ (نفسه)
│ company_id: Z    │ ────────> │ company_id: Z    │ (نفسه/قابل للتعديل)
│ start: 2024-02-01│           │ start: 2025-02-01│ (جديد)
│ end: 2025-01-31  │ ────────> │ end: 2026-01-31  │ (جديد)
│ price: 1000      │ ────────> │ price: 1000      │ (قابل للتعديل)
│ children: [a,b]  │ ────────> │ children: [a,b]  │ (نفسهم/قابل للتعديل)
│ payments: [...]  │           │ payments: []     │ (فارغة للإدخال)
└──────────────────┘           └──────────────────┘
```

---

## النتيجة المتوقعة

1. ✅ زر "تجديد" في قائمة البطاقة (للباقات والفردية)
2. ✅ زر "تجديد" في صفحة تفاصيل الوثيقة
3. ✅ زر "تجديد" في صفحة تتبع الديون
4. ✅ زر "تجديد" في تقرير التجديدات
5. ✅ المعالج يفتح مع بيانات مملوءة
6. ✅ المستخدم يعدل التواريخ والأسعار والدفعات
7. ✅ حفظ كوثيقة جديدة مستقلة
