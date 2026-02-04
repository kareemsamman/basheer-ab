
# خطة: تحسين شريط ملخص الدفعات + إصلاح حذف السيارات والعملاء

## المشاكل المحددة

### 1. شريط ملخص الدفعات شفاف
- الشريط العلوي (إجمالي الوثيقة | مجموع الدفعات | المتبقي) يستخدم `bg-muted/30` مما يجعله شفافاً
- المطلوب: خلفية صلبة غير شفافة لتحسين القراءة

### 2. السيارات لا تُحذف فعلياً من قاعدة البيانات
- النظام يستخدم **حذف ناعم** (soft delete) عبر `deleted_at`
- عند محاولة إضافة سيارة برقم موجود (محذوف ناعماً) يظهر خطأ:
  ```
  duplicate key value violates unique constraint "cars_car_number_key"
  ```
- **السبب**: يوجد قيدان UNIQUE على `car_number`:
  - `cars_car_number_key` - UNIQUE على `car_number` (بدون شرط)
  - `cars_car_number_unique` - UNIQUE على `car_number` (بدون شرط)
  - `idx_cars_car_number_unique` - UNIQUE WHERE deleted_at IS NULL
  
**المشكلة**: القيدان الأولان لا يستثنيان السجلات المحذوفة!

### 3. العملاء - نفس المشكلة
- قيدان UNIQUE على `id_number`:
  - `clients_id_number_key` - UNIQUE (بدون شرط)
  - `clients_id_number_unique` - UNIQUE (بدون شرط)
  - `idx_clients_id_number_unique` - UNIQUE WHERE deleted_at IS NULL

---

## الحل المطلوب

### الجزء 1: تحسين PaymentSummaryBar

**الملف**: `src/components/policies/wizard/PaymentSummaryBar.tsx`

تغيير الخلفية من شفافة إلى صلبة:

```tsx
// قبل
"bg-muted/30"

// بعد  
"bg-card"
```

### الجزء 2: تغيير حذف السيارة لحذف نهائي

**الملف**: `src/components/clients/ClientDetails.tsx`

تغيير عملية الحذف من soft delete إلى hard delete:

```tsx
// قبل
const { error } = await supabase
  .from('cars')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', deleteCarId);

// بعد
const { error } = await supabase
  .from('cars')
  .delete()
  .eq('id', deleteCarId);
```

**ملاحظة**: الكود الحالي يتحقق من عدم وجود وثائق قبل السماح بالحذف (السطر 642):
```tsx
if (carPolicyCounts[deleteCarId] > 0) {
  toast.error('لا يمكن حذف السيارة لوجود وثائق مرتبطة بها');
  return;
}
```

### الجزء 3: منع حذف العميل إذا لديه وثائق

**الملف**: `src/pages/Clients.tsx`

إضافة تحقق قبل الحذف:

```tsx
const handleDelete = async () => {
  if (!deletingClient) return;
  setDeleteLoading(true);
  try {
    // التحقق من وجود وثائق
    const { count } = await supabase
      .from('policies')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', deletingClient.id)
      .is('deleted_at', null);
    
    if (count && count > 0) {
      toast({ 
        title: "لا يمكن الحذف", 
        description: `العميل لديه ${count} وثيقة مرتبطة`, 
        variant: "destructive" 
      });
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
      return;
    }
    
    // إذا لا يوجد وثائق - أرشفة العميل
    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingClient.id);

    if (error) throw error;
    toast({ title: "تم الحذف", description: "تم حذف العميل بنجاح" });
    fetchClients();
  } catch (error) {
    toast({ title: "خطأ", description: "فشل في حذف العميل", variant: "destructive" });
  } finally {
    setDeleteLoading(false);
    setDeleteDialogOpen(false);
    setDeletingClient(null);
  }
};
```

### الجزء 4: إصلاح قيود UNIQUE في قاعدة البيانات

**Migration SQL جديد**:

```sql
-- حذف القيود القديمة التي لا تستثني المحذوفين
ALTER TABLE public.cars DROP CONSTRAINT IF EXISTS cars_car_number_key;
ALTER TABLE public.cars DROP CONSTRAINT IF EXISTS cars_car_number_unique;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_id_number_key;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_id_number_unique;

-- القيود الصحيحة موجودة بالفعل:
-- idx_cars_car_number_unique (WHERE deleted_at IS NULL)
-- idx_clients_id_number_unique (WHERE deleted_at IS NULL)
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/policies/wizard/PaymentSummaryBar.tsx` | خلفية صلبة بدل شفافة |
| `src/components/clients/ClientDetails.tsx` | hard delete للسيارات |
| `src/pages/Clients.tsx` | منع حذف العميل إذا لديه وثائق |
| Migration SQL | إزالة قيود UNIQUE المتعارضة |

---

## ملخص التغييرات

```text
┌─────────────────────────────────────────────────────────┐
│ PaymentSummaryBar                                       │
│ bg-muted/30 → bg-card (صلبة غير شفافة)                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ حذف السيارة                                             │
│ ┌───────────────┐   ┌───────────────┐                   │
│ │ لديها وثائق؟  │→نعم→│ رفض + رسالة  │                   │
│ └───────────────┘   └───────────────┘                   │
│        ↓ لا                                             │
│ ┌───────────────────────────────────┐                   │
│ │ DELETE FROM cars (حذف نهائي)      │                   │
│ └───────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ حذف العميل                                              │
│ ┌───────────────┐   ┌───────────────┐                   │
│ │ لديه وثائق؟   │→نعم→│ رفض + رسالة  │                   │
│ └───────────────┘   └───────────────┘                   │
│        ↓ لا                                             │
│ ┌───────────────────────────────────┐                   │
│ │ Soft Delete (أرشفة)               │                   │
│ └───────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

---

## النتيجة المتوقعة

| السيناريو | قبل | بعد |
|-----------|-----|-----|
| شريط الدفعات | شفاف | صلب |
| حذف سيارة بدون وثائق | soft delete (يبقى الرقم محجوز) | hard delete (الرقم متاح) |
| حذف سيارة بوثائق | رسالة خطأ ✅ | رسالة خطأ ✅ |
| حذف عميل بوثائق | يُحذف! ❌ | رفض + رسالة ✅ |
| حذف عميل بدون وثائق | soft delete | soft delete |
| إضافة سيارة برقم محذوف | خطأ duplicate key | يعمل ✅ |
