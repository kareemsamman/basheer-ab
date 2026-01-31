
# خطة: إصلاح المطالبات وإضافة Badge عدد المطالبات النشطة

## نظرة عامة
المشاكل الحالية:
1. **RTL في Radio Group** - يوجد `dir="ltr"` و `space-x-reverse` يجب إزالتهم
2. **البحث عن العملاء لا يعمل** - مشكلة في الاستعلام
3. **تصميم اختيار العميل** - يجب أن يكون بتصميم Cards وليس dropdown عادي
4. **عدد المطالبات النشطة** - إضافة badge في الـ Sidebar

---

## الجزء الأول: إصلاح RTL في RepairClaimDrawer

### تعديل Radio Group (سطر 418-431):

**الوضع الحالي:**
```tsx
<RadioGroup className="flex gap-4">
  <div className="flex items-center space-x-2 space-x-reverse">
```

**التعديل المطلوب:**
```tsx
<RadioGroup className="flex gap-4" dir="rtl">
  <div className="flex items-center gap-2">
```

- إزالة `space-x-2` و `space-x-reverse`
- استبدالها بـ `gap-2`
- إضافة `dir="rtl"` للـ RadioGroup

---

## الجزء الثاني: إصلاح بحث العملاء

### المشكلة:
الاستعلام الحالي يستخدم `or()` بطريقة قد تكون خاطئة

### الحل الجديد:
```typescript
const { data: clients, isLoading: clientsLoading } = useQuery({
  queryKey: ["clients-search-repair", clientSearch],
  queryFn: async () => {
    if (!clientSearch || clientSearch.length < 2) return [];
    
    const { data, error } = await supabase
      .from("clients")
      .select("id, full_name, id_number, phone_number")
      .is("deleted_at", null)
      .or(
        `full_name.ilike.%${clientSearch}%,` +
        `id_number.ilike.%${clientSearch}%,` +
        `phone_number.ilike.%${clientSearch}%`
      )
      .limit(15);
    
    if (error) {
      console.error("Client search error:", error);
      return [];
    }
    return data || [];
  },
  enabled: clientSearch.length >= 2,
});
```

---

## الجزء الثالث: تصميم اختيار العميل كـ Cards

### التصميم الجديد:

بدلاً من Command/Popover عادي، سيتم استخدام:

```tsx
{/* Client Search with Card Results */}
<FormField
  control={form.control}
  name="client_id"
  render={({ field }) => (
    <FormItem>
      <FormLabel>العميل</FormLabel>
      <div className="space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو رقم الهوية أو الهاتف..."
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            className="pr-10"
          />
        </div>

        {/* Selected Client Card */}
        {selectedClient && (
          <Card className="p-3 border-primary bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedClient.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedClient.id_number} • {selectedClient.phone_number}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  field.onChange("");
                  setClientSearch("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Search Results as Cards */}
        {!selectedClient && clientSearch.length >= 2 && (
          <div className="border rounded-lg max-h-60 overflow-auto">
            {clientsLoading ? (
              <div className="p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : clients?.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                لا توجد نتائج
              </div>
            ) : (
              <div className="divide-y">
                {clients?.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => {
                      field.onChange(client.id);
                      form.setValue("policy_id", "");
                    }}
                    className="w-full p-3 text-right hover:bg-muted/50 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-right">
                      <p className="font-medium text-sm">{client.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {client.id_number} • {client.phone_number}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## الجزء الرابع: إضافة Badge عدد المطالبات النشطة

### 1) إنشاء Hook جديد: `src/hooks/useClaimsCount.tsx`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useClaimsCount() {
  const [claimsCount, setClaimsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClaimsCount = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('repair_claims')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'completed');
      
      if (error) throw error;
      setClaimsCount(count || 0);
    } catch (error) {
      console.error('Error fetching claims count:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaimsCount();
    const interval = setInterval(fetchClaimsCount, 30000);
    const handleFocus = () => fetchClaimsCount();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchClaimsCount]);

  return { claimsCount, isLoading };
}
```

### 2) إنشاء Component: `src/components/layout/SidebarClaimsBadge.tsx`

```typescript
import { useClaimsCount } from '@/hooks/useClaimsCount';
import { cn } from '@/lib/utils';

interface SidebarClaimsBadgeProps {
  collapsed?: boolean;
}

export function SidebarClaimsBadge({ collapsed }: SidebarClaimsBadgeProps) {
  const { claimsCount, isLoading } = useClaimsCount();

  if (isLoading || claimsCount === 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium",
        collapsed ? "absolute -top-1 -left-1 h-4 w-4 min-w-4" : "h-5 min-w-5 px-1.5 mr-auto"
      )}
    >
      <span className="ltr-nums">{claimsCount > 99 ? '99+' : claimsCount}</span>
    </span>
  );
}
```

### 3) تحديث Sidebar.tsx:

إضافة `claims` كنوع badge جديد:

```typescript
interface NavItem {
  // ... existing
  badge?: 'notifications' | 'debt' | 'tasks' | 'claims';
}

// في navigationGroups - المطالبات:
{ name: "المطالبات", href: "/admin/claims", icon: FileWarning, adminOnly: true, badge: 'claims' },

// في renderBadge:
const renderBadge = (item: NavItem) => {
  if (!item.badge) return null;
  if (item.badge === 'notifications') return <SidebarNotificationBadge collapsed={collapsed} />;
  if (item.badge === 'debt') return <SidebarDebtBadge collapsed={collapsed} />;
  if (item.badge === 'tasks') return <SidebarTaskBadge collapsed={collapsed} />;
  if (item.badge === 'claims') return <SidebarClaimsBadge collapsed={collapsed} />;
  return null;
};
```

---

## ملخص الملفات المطلوب تعديلها

| الملف | التعديل |
|-------|---------|
| `src/components/claims/RepairClaimDrawer.tsx` | إصلاح RTL + تحسين بحث العملاء + تصميم Cards |
| `src/hooks/useClaimsCount.tsx` | إنشاء جديد - عدد المطالبات النشطة |
| `src/components/layout/SidebarClaimsBadge.tsx` | إنشاء جديد - Badge المطالبات |
| `src/components/layout/Sidebar.tsx` | إضافة badge للمطالبات |

---

## النتيجة المتوقعة

1. **RTL صحيح** - Radio buttons بالاتجاه الصحيح
2. **بحث العملاء يعمل** - نتائج تظهر عند البحث
3. **تصميم Cards** - اختيار العميل بشكل أنيق
4. **Badge المطالبات** - عدد المطالبات النشطة (غير مكتملة) في القائمة الجانبية باللون الأحمر

