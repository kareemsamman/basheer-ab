
# خطة: إضافة ميزة التجديد في صفحة تقارير التجديدات

## الهدف

إضافة زر "تجديد" في صفحة `/reports/policies` تبويب "التجديدات" لكل عميل، بحيث عند النقر:
1. يفتح معالج الوثيقة مع بيانات مملوءة مسبقاً
2. بعد الحفظ الناجح، يتم إزالة العميل من قائمة "التجديدات" ويظهر في "تم التجديد"

---

## آلية العمل

```text
قائمة التجديدات (العملاء بحاجة للتجديد)
┌─────────────────────────────────────────────────────────────────┐
│ عنان ادريس | 3 وثيقة | إلزامي + ثالث/شامل + خدمات الطريق        │
│ [⋮] ← القائمة: تحديث الحالة | إرسال SMS | اتصال | 🔄 تجديد     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ النقر على "تجديد"
┌─────────────────────────────────────────────────────────────────┐
│ PolicyWizard يفتح مع:                                           │
│ ✓ الخطوة 1: العميل محدد + نوع التأمين                           │
│ ✓ الخطوة 2: السيارة محددة                                       │
│ ✓ الخطوة 3: الشركات + الأسعار + التواريخ الجديدة                │
│ ✗ الخطوة 4: الدفعات (فارغة أو دفعة إلزامي فقط)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ حفظ الوثيقة الجديدة
┌─────────────────────────────────────────────────────────────────┐
│ ✓ Trigger في قاعدة البيانات يُحدّث حالة الوثيقة القديمة        │
│   → renewal_status = 'renewed' تلقائياً                         │
│                                                                 │
│ ✓ العميل يختفي من "التجديدات" ويظهر في "تم التجديد"            │
└─────────────────────────────────────────────────────────────────┘
```

---

## التغييرات المطلوبة

### 1. إضافة State وWizard في PolicyReports.tsx

**الملف:** `src/pages/PolicyReports.tsx`

```typescript
// إضافة State جديد
const [wizardOpen, setWizardOpen] = useState(false);
const [renewalData, setRenewalData] = useState<RenewalData | null>(null);
const [renewingClientId, setRenewingClientId] = useState<string | null>(null);

// إضافة import
import { PolicyWizard } from '@/components/policies/PolicyWizard';
import { RenewalData } from '@/components/policies/wizard/types';
```

### 2. إضافة دالة handleRenewFromReport

```typescript
const handleRenewFromReport = async (client: RenewalClient) => {
  setRenewingClientId(client.client_id);
  
  try {
    // جلب تفاصيل الوثائق لهذا العميل
    const { startDate, endDate } = getRenewalDateRange();
    const { data: policies } = await supabase.rpc('get_client_renewal_policies', {
      p_client_id: client.client_id,
      p_start_date: startDate,
      p_end_date: endDate
    });
    
    if (!policies?.length) {
      toast.error('لم يتم العثور على الوثائق');
      return;
    }
    
    // تحديد الوثيقة الرئيسية (THIRD_FULL أو ELZAMI)
    const mainPolicy = policies.find(p => 
      p.policy_type_parent === 'THIRD_FULL' || p.policy_type_parent === 'ELZAMI'
    ) || policies[0];
    
    // بناء الإضافات من باقي الوثائق
    const addons = policies
      .filter(p => p.id !== mainPolicy.id)
      .map(p => ({
        type: p.policy_type_parent.toLowerCase() as any,
        companyId: p.company_id || '',
        insurancePrice: p.insurance_price,
        roadServiceId: undefined, // سيتم جلبها من الوثيقة
        policyTypeChild: p.policy_type_child,
      }));
    
    // إعداد بيانات التجديد
    const renewal: RenewalData = {
      clientId: client.client_id,
      carId: mainPolicy.car_id,
      categorySlug: 'THIRD_FULL', // للسيارات
      policyTypeParent: mainPolicy.policy_type_parent,
      policyTypeChild: mainPolicy.policy_type_child,
      companyId: mainPolicy.company_id || '',
      insurancePrice: mainPolicy.insurance_price,
      packageAddons: addons.length > 0 ? addons : undefined,
      originalEndDate: mainPolicy.end_date,
    };
    
    setRenewalData(renewal);
    setWizardOpen(true);
  } catch (error) {
    console.error('Error preparing renewal:', error);
    toast.error('فشل في تحضير التجديد');
  } finally {
    setRenewingClientId(null);
  }
};
```

### 3. إضافة زر التجديد في DropdownMenu (السطر 1333)

```tsx
<DropdownMenuContent align="end">
  {/* ... الخيارات الموجودة ... */}
  
  <DropdownMenuSeparator />
  <DropdownMenuItem 
    onClick={() => handleRenewFromReport(client)}
    disabled={renewingClientId === client.client_id}
  >
    {renewingClientId === client.client_id ? (
      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
    ) : (
      <RefreshCw className="h-4 w-4 ml-2" />
    )}
    تجديد ({client.policies_count} وثيقة)
  </DropdownMenuItem>
</DropdownMenuContent>
```

### 4. إضافة PolicyWizard كمكون (قبل Dialog)

```tsx
{/* Policy Wizard for Renewal */}
<PolicyWizard
  open={wizardOpen}
  onOpenChange={(open) => {
    setWizardOpen(open);
    if (!open) {
      setRenewalData(null);
    }
  }}
  onSuccess={() => {
    setWizardOpen(false);
    setRenewalData(null);
    toast.success('تم تجديد الوثيقة بنجاح');
    // إعادة تحميل البيانات - العميل سينتقل تلقائياً لـ "تم التجديد"
    fetchRenewals();
  }}
  renewalData={renewalData ?? undefined}
/>
```

### 5. إضافة Import للـ DropdownMenuSeparator

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator, // ← إضافة
} from '@/components/ui/dropdown-menu';
```

---

## كيف يتم نقل العميل تلقائياً لـ "تم التجديد"؟

النظام يحتوي على Trigger في قاعدة البيانات `trg_auto_mark_renewed`:
- عند إضافة وثيقة جديدة لنفس العميل/السيارة/نوع التأمين
- يتم تحديث حالة الوثيقة القديمة إلى `renewed` تلقائياً
- بالتالي عند `fetchRenewals()` لن يظهر العميل لأن وثائقه أصبحت renewed

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/pages/PolicyReports.tsx` | إضافة زر تجديد + state + wizard + handler |

---

## تدفق المستخدم

```text
1. المستخدم في تبويب "التجديدات"
2. يرى قائمة العملاء بحاجة للتجديد
3. ينقر على ⋮ بجانب اسم العميل
4. يختار "تجديد (3 وثيقة)"
5. يفتح PolicyWizard مع البيانات مملوءة
6. يُعدّل التواريخ/الأسعار إذا لزم
7. يضيف الدفعات
8. يحفظ
9. يظهر toast "تم تجديد الوثيقة بنجاح"
10. يختفي العميل من "التجديدات" ويظهر في "تم التجديد"
```

---

## النتيجة المتوقعة

| السيناريو | النتيجة |
|-----------|---------|
| عميل بـ 3 وثائق | يظهر خيار "تجديد (3 وثيقة)" |
| بعد التجديد | العميل يختفي من التجديدات |
| تبويب "تم التجديد" | العميل يظهر مع الوثائق الجديدة والقديمة |
| Trigger قاعدة البيانات | يُحدّث حالة الوثائق القديمة تلقائياً |

