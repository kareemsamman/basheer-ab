
# خطة: إصلاح مشكلتين - الملاحظات والقائمة المنسدلة للمهام

## المشاكل المكتشفة

### المشكلة 1: الملاحظات في صفحة متابعة الديون لا تعمل للعمال

**السبب الجذري:**
- مكون `ClientNotesPopover` يُستدعى بدون تمرير `branchId`
- عند الإدراج، يُرسل `branch_id: null`
- سياسة RLS `client_notes_insert` تتحقق من `can_access_branch(auth.uid(), branch_id)`
- دالة `can_access_branch` تُرجع `false` إذا كان `branch_id = NULL` للعمال (غير المدراء)

**الحل:**
- تمرير `branchId` من `useAuth()` إلى مكون `ClientNotesPopover` في صفحة `DebtTracking`

---

### المشكلة 2: القائمة المنسدلة في المهام تعرض المستخدم الحالي فقط

**السبب الجذري:**
- سياسة RLS على جدول `profiles`:
  - "Users can view their own profile" → `id = auth.uid()` 
  - "Admins can view all profiles" → `has_role(auth.uid(), 'admin')`
- العامل (worker) يرى ملفه الشخصي فقط، ولا يستطيع رؤية الآخرين
- هذا يجعل `TaskDrawer` يعرض المستخدم الحالي فقط في قائمة "مسندة إلى"

**الحل:**
- إضافة سياسة RLS جديدة تسمح للمستخدمين النشطين برؤية جميع الملفات النشطة
- أو استخدام view/function خاصة للحصول على قائمة المستخدمين

---

## التغييرات المطلوبة

### 1) إصلاح الملاحظات - `src/pages/DebtTracking.tsx`

```typescript
// إضافة useAuth للحصول على branchId
const { profile } = useAuth();

// تمرير branchId إلى ClientNotesPopover
<ClientNotesPopover
  clientId={client.client_id}
  clientName={client.client_name}
  branchId={profile?.branch_id}  // إضافة هذا السطر
/>
```

### 2) إصلاح قائمة المستخدمين - `TaskDrawer.tsx`

**خياران:**

**الخيار أ (الأبسط):** إنشاء RPC function لجلب المستخدمين

```sql
CREATE OR REPLACE FUNCTION get_active_users_for_tasks()
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email
  FROM profiles p
  WHERE p.status = 'active'
  ORDER BY p.full_name NULLS LAST;
$$;
```

ثم في `TaskDrawer.tsx`:
```typescript
const { data: users = [] } = useQuery({
  queryKey: ['active-users-for-tasks'],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('get_active_users_for_tasks');
    if (error) throw error;
    return data || [];
  },
});
```

**الخيار ب:** تعديل سياسة RLS

إضافة سياسة جديدة للسماح للمستخدمين النشطين برؤية ملفات المستخدمين النشطين:

```sql
CREATE POLICY "Active users can view active profiles for task assignment"
ON profiles FOR SELECT
TO authenticated
USING (
  is_active_user(auth.uid()) 
  AND status = 'active'
);
```

**ملاحظة:** الخيار أ أفضل لأنه:
- أكثر تحديداً (فقط للمهام)
- لا يؤثر على الأمان العام
- `SECURITY DEFINER` يتجاوز RLS

---

## ملخص الملفات

| الملف | التغيير | الوصف |
|-------|---------|-------|
| `src/pages/DebtTracking.tsx` | تعديل | إضافة useAuth وتمرير branchId |
| `src/components/tasks/TaskDrawer.tsx` | تعديل | استخدام RPC بدلاً من query مباشر |
| Database Migration | جديد | إنشاء function `get_active_users_for_tasks` |

---

## خطوات التنفيذ

1. **إنشاء Database Migration:**
   - إضافة `get_active_users_for_tasks()` function

2. **تعديل `DebtTracking.tsx`:**
   - استيراد `useAuth`
   - تمرير `profile?.branch_id` لكل `ClientNotesPopover`

3. **تعديل `TaskDrawer.tsx`:**
   - تغيير الـ query لاستخدام RPC function
   - التأكد من عرض جميع المستخدمين النشطين

---

## النتيجة المتوقعة

1. ✅ الملاحظات تعمل للعمال في صفحة متابعة الديون
2. ✅ قائمة المستخدمين تعرض جميع الموظفين (مدراء + عمال)
3. ✅ العامل يستطيع إسناد مهمة لأي شخص نشط
