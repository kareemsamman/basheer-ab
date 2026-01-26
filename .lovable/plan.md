
# خطة إصلاح خطأ RLS عند إنشاء دفعة تحويل

## المشكلة
عند إنشاء وثيقة جديدة مع دفعة من نوع "تحويل"، يظهر خطأ:
```
new row violates row-level security policy for table "policy_payments"
```

## السبب الجذري
سياسة RLS على جدول `policy_payments` تستخدم الـ function `can_access_branch()` للتحقق من صلاحيات الوصول. المشكلة أن:

1. عندما يكون `branch_id = null` في الدفعة، المقارنة `profile.branch_id = null` ترجع `NULL` وليس `true/false`
2. هذا يتسبب في فشل سياسة RLS حتى للمشرفين (admins)

## الحل المقترح

### الخيار 1: تعديل الـ SQL function (الأفضل)
تحديث `can_access_branch` لتتعامل مع `null` بشكل صحيح:

```sql
CREATE OR REPLACE FUNCTION can_access_branch(_user_id uuid, _branch_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Admins can access all branches (including null)
  IF public.has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;
  
  -- If branch_id is null, deny access for non-admins
  IF _branch_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Workers can only access their assigned branch
  RETURN (SELECT branch_id FROM public.profiles WHERE id = _user_id) = _branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### الخيار 2: التأكد من وجود branch_id في Frontend
إضافة تحقق في `PolicyWizard.tsx` قبل إدخال الدفعات للتأكد من وجود `branch_id`:

```typescript
// قبل إدخال الدفعات
if (!effectiveBranchId) {
  throw new Error('Branch ID is required for payments');
}
```

## التغييرات المطلوبة

### 1. تحديث database function
```
الملف: SQL Migration
الإجراء: تعديل function can_access_branch لتتعامل مع null
```

### 2. تحديث PolicyWizard.tsx (اختياري - كحماية إضافية)
```
الملف: src/components/policies/PolicyWizard.tsx
الإجراء: إضافة validation للتأكد من وجود branch_id قبل الحفظ
```

## تسلسل التنفيذ

```text
┌─────────────────────────────────────────────────┐
│  1. تعديل SQL function can_access_branch       │
│     لتتعامل مع null بشكل صحيح                  │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  2. إضافة validation في PolicyWizard           │
│     للتأكد من وجود branch_id                   │
└─────────────────────────────────────────────────┘
```

## ملاحظات فنية
- الإصلاح في الـ database function يحل المشكلة لجميع العمليات وليس فقط wizard
- Admin يمكنه الوصول لأي فرع بما في ذلك `null`
- Worker يحتاج `branch_id` صالح دائماً
