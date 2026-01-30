

# خطة: صفحة المطالبات + جلسة إدارية مؤقتة

## نظرة عامة
1. **صفحة المطالبات (Claims)** - صفحة للمسؤول لتتبع تصليحات السيارات التي يدفعها من حسابه الشخصي
2. **جلسة مؤقتة للأدمن** - إنهاء الجلسة عند إغلاق المتصفح لجميع الأدمن ما عدا `morshed500@gmail.com`

---

## الجزء الأول: صفحة المطالبات

### 1) جدول قاعدة البيانات

**جدول جديد:** `repair_claims`

| العمود | النوع | الوصف |
|--------|------|-------|
| id | uuid | المفتاح الأساسي |
| claim_number | text | رقم الملف (تسلسلي تلقائي) |
| garage_name | text | اسم الكراج (مطلوب) |
| insurance_company_id | uuid | FK لشركة التأمين |
| insurance_file_number | text | رقم ملف التأمين |
| accident_date | date | تاريخ الحادث |
| car_type | text | نوع السيارة (external أو insured) |
| external_car_number | text | رقم السيارة الخارجية |
| external_car_model | text | موديل السيارة الخارجية |
| client_id | uuid | FK للعميل المؤمن (إختياري) |
| policy_id | uuid | FK للبوليصة (إختياري) |
| status | text | الحالة: open, in_progress, completed |
| repairs_description | text | وصف التصليحات (عند الإغلاق) |
| total_amount | decimal | المبلغ الإجمالي |
| expense_id | uuid | FK للمصروف المرتبط |
| notes | text | ملاحظات |
| created_at | timestamp | تاريخ الإنشاء |
| created_by | uuid | المستخدم المنشئ |

```sql
CREATE TABLE public.repair_claims (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_number text UNIQUE,
  garage_name text NOT NULL,
  insurance_company_id uuid REFERENCES insurance_companies(id),
  insurance_file_number text,
  accident_date date,
  car_type text DEFAULT 'external' CHECK (car_type IN ('external', 'insured')),
  external_car_number text,
  external_car_model text,
  client_id uuid REFERENCES clients(id),
  policy_id uuid REFERENCES policies(id),
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed')),
  repairs_description text,
  total_amount decimal(10,2),
  expense_id uuid REFERENCES expenses(id),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS - Admin only
ALTER TABLE public.repair_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage repair claims"
  ON public.repair_claims FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR auth.jwt() ->> 'email' = 'morshed500@gmail.com');

-- Trigger for auto claim number
CREATE OR REPLACE FUNCTION generate_claim_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.claim_number := 'CLM-' || LPAD(nextval('claim_number_seq')::text, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE claim_number_seq START 1;
CREATE TRIGGER set_claim_number BEFORE INSERT ON repair_claims
  FOR EACH ROW EXECUTE FUNCTION generate_claim_number();
```

**جدول الملاحظات/التتبع:** `repair_claim_notes`

```sql
CREATE TABLE public.repair_claim_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid REFERENCES repair_claims(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.repair_claim_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage claim notes"
  ON public.repair_claim_notes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR auth.jwt() ->> 'email' = 'morshed500@gmail.com');
```

**جدول التذكيرات:** `repair_claim_reminders`

```sql
CREATE TABLE public.repair_claim_reminders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid REFERENCES repair_claims(id) ON DELETE CASCADE,
  reminder_date date NOT NULL,
  reminder_time time DEFAULT '09:00',
  reminder_type text CHECK (reminder_type IN ('garage', 'insured', 'other')),
  message text,
  is_done boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.repair_claim_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage claim reminders"
  ON public.repair_claim_reminders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR auth.jwt() ->> 'email' = 'morshed500@gmail.com');
```

### 2) صفحة المطالبات

**ملف جديد:** `src/pages/RepairClaims.tsx`

**المميزات:**
- قائمة بطاقات للمطالبات المفتوحة
- فلترة حسب الحالة (مفتوح، قيد التنفيذ، مكتمل)
- بحث بالاسم أو رقم الملف
- Badge للحالة (ألوان مختلفة)
- **Admin Route Only**

**تصميم البطاقة:**
```text
┌──────────────────────────────────────────┐
│ CLM-000001              🟢 مفتوح        │
│ ─────────────────────────────────────── │
│ 🏪 كراج: أبو سليم                       │
│ 🏢 شركة: مجموعة AIG                     │
│ 📁 ملف: 12345                           │
│ 📅 تاريخ الحادث: 15/01/2026             │
│ 🚗 سيارة: 12-345-67 (شامل - كريم)       │
│                                          │
│ ⏰ 2 تذكيرات   📝 3 ملاحظات              │
│                                          │
│ [فتح] [إضافة ملاحظة] [تذكير] [⋮]        │
└──────────────────────────────────────────┘
```

### 3) Drawer إنشاء/تعديل المطالبة

**ملف جديد:** `src/components/claims/RepairClaimDrawer.tsx`

**الحقول:**
| الحقل | النوع | مطلوب |
|-------|------|-------|
| اسم الكراج | Input + Autocomplete من business_contacts | ✅ |
| شركة التأمين | Select من insurance_companies | ❌ |
| رقم ملف التأمين | Input | ❌ |
| تاريخ الحادث | DatePicker | ❌ |
| نوع السيارة | Radio: خارجية / مؤمن | ✅ |

**إذا سيارة خارجية:**
- رقم السيارة
- موديل السيارة

**إذا سيارة مؤمن:**
- بحث واختيار العميل
- اختيار البوليصة (ثالث أو خدمات طريق فقط - لا إلزامي)

### 4) صفحة تفاصيل المطالبة

**ملف جديد:** `src/pages/RepairClaimDetail.tsx`

**المحتويات:**
- معلومات المطالبة الأساسية
- Timeline للملاحظات (مثل client_notes)
- قائمة التذكيرات مع إمكانية إضافة جديد
- زر "إغلاق الملف" - يفتح Dialog لإدخال:
  - وصف التصليحات
  - المبلغ الإجمالي
  - يتم إنشاء expense تلقائياً في المصاريف

### 5) تحديث App.tsx و Sidebar

```tsx
// App.tsx
<Route path="/admin/claims" element={
  <AdminRoute>
    <RepairClaims />
  </AdminRoute>
} />
<Route path="/admin/claims/:claimId" element={
  <AdminRoute>
    <RepairClaimDetail />
  </AdminRoute>
} />

// Sidebar.tsx - في قسم الإدارة
{ name: "المطالبات", href: "/admin/claims", icon: FileWarning },
```

---

## الجزء الثاني: جلسة مؤقتة للأدمن

### المتطلبات:
- جميع الأدمن (ما عدا `morshed500@gmail.com`) → جلسة مؤقتة (تنتهي عند إغلاق المتصفح)
- Super admin + Workers → جلسة دائمة (localStorage)

### التنفيذ:

**1) تعديل Supabase Client (غير مسموح - ملف تلقائي)**

لا يمكن تعديل `src/integrations/supabase/client.ts` لأنه ملف تلقائي.

**2) الحل البديل: مراقبة visibility + beforeunload**

**ملف جديد:** `src/hooks/useAdminSessionGuard.tsx`

```tsx
import { useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

const SUPER_ADMIN_EMAIL = 'morshed500@gmail.com';

export function useAdminSessionGuard() {
  const { user, isAdmin, isSuperAdmin } = useAuth();

  const shouldEnforceSessionTimeout = useCallback(() => {
    // Only enforce for admins who are NOT super admin
    return user && isAdmin && !isSuperAdmin;
  }, [user, isAdmin, isSuperAdmin]);

  useEffect(() => {
    if (!shouldEnforceSessionTimeout()) return;

    // Clear session on page unload (browser close/tab close)
    const handleBeforeUnload = () => {
      // Set a flag in sessionStorage to detect browser restart
      sessionStorage.setItem('admin_session_active', 'true');
    };

    // Check on page load if this is a new browser session
    const checkSessionOnLoad = async () => {
      const wasActive = sessionStorage.getItem('admin_session_active');
      if (!wasActive && user) {
        // This is a new browser session - force logout
        await supabase.auth.signOut();
        window.location.href = '/login';
      }
    };

    // Set flag immediately
    sessionStorage.setItem('admin_session_active', 'true');
    
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldEnforceSessionTimeout, user]);
}
```

**3) استخدام الـ Hook في AuthProvider**

```tsx
// في useAuth.tsx - إضافة في useEffect الرئيسي
useEffect(() => {
  // للأدمن (غير السوبر أدمن): التحقق من الجلسة
  const wasActive = sessionStorage.getItem('admin_session_active');
  const isNonSuperAdmin = user?.email !== 'morshed500@gmail.com' && isAdmin;
  
  if (isNonSuperAdmin && !wasActive && user) {
    // جلسة جديدة بعد إغلاق المتصفح - تسجيل الخروج
    supabase.auth.signOut();
    return;
  }
  
  if (isNonSuperAdmin) {
    sessionStorage.setItem('admin_session_active', 'true');
  }
}, [user, isAdmin]);
```

**ملاحظة مهمة:** هذا الحل يستخدم `sessionStorage` الذي يتم مسحه تلقائياً عند إغلاق المتصفح، بينما `localStorage` (المستخدم للجلسة العادية) يبقى.

---

## ملخص الملفات

| الملف | الإجراء |
|-------|---------|
| Database Migration | إنشاء 3 جداول: repair_claims, repair_claim_notes, repair_claim_reminders |
| `src/pages/RepairClaims.tsx` | إنشاء جديد |
| `src/pages/RepairClaimDetail.tsx` | إنشاء جديد |
| `src/components/claims/RepairClaimDrawer.tsx` | إنشاء جديد |
| `src/components/claims/ClaimNoteTimeline.tsx` | إنشاء جديد |
| `src/components/claims/ClaimReminderList.tsx` | إنشاء جديد |
| `src/components/claims/CloseClaimDialog.tsx` | إنشاء جديد |
| `src/hooks/useAdminSessionGuard.tsx` | إنشاء جديد |
| `src/hooks/useAuth.tsx` | تعديل لإضافة session guard |
| `src/App.tsx` | إضافة Routes |
| `src/components/layout/Sidebar.tsx` | إضافة رابط |

---

## سير العمل المتوقع

### إنشاء مطالبة:
1. المسؤول يضغط "إضافة مطالبة"
2. يختار الكراج (من جهات الاتصال أو يكتب جديد)
3. يختار شركة التأمين ويدخل رقم الملف
4. يختار نوع السيارة:
   - خارجية: يدخل بيانات السيارة
   - مؤمن: يبحث عن العميل ويختار البوليصة (ثالث/خدمات طريق)
5. يحفظ المطالبة

### متابعة الملف:
1. يفتح المطالبة
2. يضيف ملاحظات (Timeline)
3. يضيف تذكيرات (للكراج أو للمؤمن)
4. التذكيرات تظهر في popup مثل المهام

### إغلاق الملف:
1. المسؤول يضغط "إغلاق الملف"
2. يدخل وصف التصليحات والمبلغ
3. النظام ينشئ مصروف جديد تلقائياً في جدول expenses
4. الحالة تتغير إلى "مكتمل"

### جلسة الأدمن:
- عند إغلاق المتصفح: الجلسة تنتهي
- عند فتح المتصفح مجدداً: يُطلب تسجيل دخول جديد
- Super admin (`morshed500@gmail.com`): لا يتأثر

