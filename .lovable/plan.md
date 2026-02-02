
# خطة: إضافة رابط "التجديدات" مع شارة العدد في القائمة الجانبية

## المطلوب
إضافة رابط مباشر "التجديدات" تحت "تقارير الوثائق" في القائمة الجانبية، مع شارة (badge) تعرض عدد العملاء الذين تحتاج وثائقهم للتجديد.

---

## التغييرات التقنية

### 1. إنشاء hook جديد: `useRenewalsCount.tsx`
**المسار:** `src/hooks/useRenewalsCount.tsx`

مثل `useDebtCount`، هذا الـ hook سيستدعي `report_renewals_summary` للحصول على عدد العملاء المحتاجين للتجديد.

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRenewalsCount() {
  const [renewalsCount, setRenewalsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    // Get current month for default filter
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
    
    const { data, error } = await supabase.rpc('report_renewals_summary', {
      p_end_month: `${currentMonth}-01`,
      p_policy_type: null,
      p_created_by: null,
      p_search: null
    });
    
    if (!error && data && data.length > 0) {
      setRenewalsCount(data[0].total_expiring || 0);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60000); // Refresh every minute
    window.addEventListener('focus', fetchCount);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchCount);
    };
  }, [fetchCount]);

  return { renewalsCount, isLoading };
}
```

---

### 2. إنشاء مكون الشارة: `SidebarRenewalsBadge.tsx`
**المسار:** `src/components/layout/SidebarRenewalsBadge.tsx`

```typescript
import { useRenewalsCount } from '@/hooks/useRenewalsCount';
import { cn } from '@/lib/utils';

export function SidebarRenewalsBadge({ collapsed }: { collapsed?: boolean }) {
  const { renewalsCount, isLoading } = useRenewalsCount();

  if (isLoading || renewalsCount === 0) return null;

  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-medium",
      collapsed 
        ? "absolute -top-1 -left-1 h-4 w-4 min-w-4" 
        : "h-5 min-w-5 px-1.5 mr-auto"
    )}>
      <span className="ltr-nums">{renewalsCount > 99 ? '99+' : renewalsCount}</span>
    </span>
  );
}
```

---

### 3. تحديث `Sidebar.tsx`

#### أ) إضافة import للشارة الجديدة
```typescript
import { SidebarRenewalsBadge } from "./SidebarRenewalsBadge";
```

#### ب) إضافة نوع جديد للـ badge
```typescript
// السطر 55
badge?: 'notifications' | 'debt' | 'tasks' | 'claims' | 'accidents' | 'renewals';
```

#### ج) إضافة رابط "التجديدات" تحت "تقارير الوثائق"
```typescript
// السطر 103-110 - مجموعة التقارير
{
  name: "التقارير",
  icon: BarChart3,
  items: [
    { name: "تقارير الوثائق", href: "/reports/policies", icon: BarChart3 },
    { name: "التجديدات", href: "/reports/policies?tab=renewals", icon: RefreshCw, badge: 'renewals' },  // ← جديد
    { name: "تقرير الشركات", href: "/reports/company-settlement", icon: BarChart3, adminOnly: true },
    { name: "التقارير المالية", href: "/reports/financial", icon: Wallet, adminOnly: true },
  ],
},
```

#### د) إضافة RefreshCw للـ imports
```typescript
import { ..., RefreshCw } from "lucide-react";
```

#### هـ) تحديث دالة renderBadge
```typescript
const renderBadge = (item: NavItem) => {
  if (!item.badge) return null;
  // ... الموجود
  if (item.badge === 'renewals') return <SidebarRenewalsBadge collapsed={collapsed} />;
  return null;
};
```

---

## ملخص الملفات

| الملف | التغيير |
|-------|---------|
| `src/hooks/useRenewalsCount.tsx` | إنشاء جديد - hook لجلب عدد التجديدات |
| `src/components/layout/SidebarRenewalsBadge.tsx` | إنشاء جديد - مكون الشارة |
| `src/components/layout/Sidebar.tsx` | إضافة رابط التجديدات + دعم الشارة |

---

## النتيجة المتوقعة

```text
التقارير
├── تقارير الوثائق
├── التجديدات [12]  ← شارة برتقالية بعدد العملاء
├── تقرير الشركات (admin)
└── التقارير المالية (admin)
```

1. رابط "التجديدات" يظهر تحت "تقارير الوثائق"
2. الشارة البرتقالية تعرض عدد العملاء المحتاجين للتجديد
3. النقر على الرابط يفتح `/reports/policies` مع تبويب التجديدات محدد
4. العدد يتحدث تلقائياً كل دقيقة
