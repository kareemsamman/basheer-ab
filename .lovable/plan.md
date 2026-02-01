
# خطة: إصلاح مشكلة "غير معروف" وتحديد الوقت الافتراضي للمهمة

## المشاكل المكتشفة

### المشكلة 1: "غير معروف" لمنشئ المهمة

**السبب:**
- عند جلب المهام، الـ query يعمل JOIN مع جدول `profiles`:
```typescript
creator:profiles!tasks_created_by_fkey(id, full_name, email),
assignee:profiles!tasks_assigned_to_fkey(id, full_name, email)
```
- سياسة RLS على `profiles` تمنع العمال من رؤية ملفات المستخدمين الآخرين
- النتيجة: `creator` و `assignee` يعودان كـ `null` → يظهر "غير معروف"

**الحل:**
- إنشاء RPC function جديدة `get_tasks_with_users` تستخدم `SECURITY DEFINER` لجلب المهام مع بيانات المستخدمين

---

### المشكلة 2: الوقت الافتراضي ثابت على 09:00

**السبب:**
في `TaskDrawer.tsx` سطر 90:
```typescript
setDueTime("09:00"); // ← ثابت دائماً
```

**الحل:**
إضافة دالة لحساب الوقت الحالي مع التقريب لأقرب 30 دقيقة:
```typescript
function getCurrentTimeRounded(): string {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // تقريب لأسفل لأقرب 30 دقيقة
  const roundedMinutes = minutes < 30 ? 0 : 30;
  
  // التأكد من أن الوقت ضمن النطاق المتاح (06:00 - 23:30)
  const clampedHours = Math.max(6, Math.min(23, hours));
  
  return `${clampedHours.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`;
}

// مثال:
// 09:51 → 09:30
// 10:05 → 10:00
// 10:45 → 10:30
// 05:20 → 06:00 (الحد الأدنى)
```

---

## التغييرات المطلوبة

### 1) إنشاء RPC Function - Database Migration

```sql
CREATE OR REPLACE FUNCTION public.get_tasks_with_users(target_date DATE)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  created_by uuid,
  assigned_to uuid,
  due_date date,
  due_time time,
  status text,
  reminder_shown boolean,
  completed_at timestamptz,
  completed_by uuid,
  branch_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  creator_id uuid,
  creator_full_name text,
  creator_email text,
  assignee_id uuid,
  assignee_full_name text,
  assignee_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    t.id, t.title, t.description, t.created_by, t.assigned_to,
    t.due_date, t.due_time, t.status, t.reminder_shown,
    t.completed_at, t.completed_by, t.branch_id, t.created_at, t.updated_at,
    c.id as creator_id, c.full_name as creator_full_name, c.email as creator_email,
    a.id as assignee_id, a.full_name as assignee_full_name, a.email as assignee_email
  FROM tasks t
  LEFT JOIN profiles c ON t.created_by = c.id
  LEFT JOIN profiles a ON t.assigned_to = a.id
  WHERE t.due_date = target_date
  ORDER BY t.due_time ASC;
$$;
```

### 2) تعديل `src/hooks/useTasks.tsx`

```typescript
// استخدام RPC بدلاً من query مباشر
const { data, error } = await supabase.rpc('get_tasks_with_users', {
  target_date: dateStr
});

// تحويل الـ flat data إلى nested format
const formatted = (data || []).map(row => ({
  ...row,
  creator: { id: row.creator_id, full_name: row.creator_full_name, email: row.creator_email },
  assignee: { id: row.assignee_id, full_name: row.assignee_full_name, email: row.assignee_email }
}));
```

### 3) تعديل `src/components/tasks/TaskDrawer.tsx`

```typescript
// إضافة دالة لحساب الوقت
function getCurrentTimeRounded(): string {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  
  // تقريب لأسفل لأقرب 30 دقيقة
  const roundedMinutes = minutes < 30 ? 0 : 30;
  
  // التأكد من النطاق (06:00 - 23:30)
  if (hours < 6) hours = 6;
  if (hours > 23) {
    hours = 23;
  }
  
  return `${hours.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`;
}

// في useEffect عند إنشاء مهمة جديدة:
setDueTime(getCurrentTimeRounded()); // بدلاً من "09:00"
```

---

## ملخص الملفات

| الملف | التغيير |
|-------|---------|
| Database Migration | إضافة `get_tasks_with_users()` function |
| `src/hooks/useTasks.tsx` | استخدام RPC للحصول على المهام مع أسماء المستخدمين |
| `src/components/tasks/TaskDrawer.tsx` | تغيير الوقت الافتراضي ليكون الوقت الحالي مقرب |

---

## النتيجة المتوقعة

1. ✅ اسم المنشئ يظهر بشكل صحيح (مثال: "yaman" بدلاً من "غير معروف")
2. ✅ عند إنشاء مهمة جديدة الساعة 9:51، الوقت يكون 09:30
3. ✅ عند إنشاء مهمة جديدة الساعة 10:05، الوقت يكون 10:00
4. ✅ عند إنشاء مهمة جديدة الساعة 10:45، الوقت يكون 10:30
