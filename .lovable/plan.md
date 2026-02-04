
# خطة: إصلاح حذف الوثائق المحولة + حذف السيارة 3643670

## المشاكل المكتشفة

### 1. السيارة 3643670 - محذوفة ناعماً
```
id: bf939a7d-a1d2-4f5f-a5bf-ce30bd39e935
car_number: 3643670
deleted_at: 2026-02-04 08:17:14.835+00
```
**الحل**: حذف نهائي مباشرة من قاعدة البيانات.

### 2. فشل حذف الوثائق المحولة
**الخطأ**:
```
update or delete on table "policies" violates foreign key constraint 
"policy_transfers_new_policy_id_fkey" on table "policy_transfers"
```

**السبب**: جدول `policy_transfers` يحتوي على:
- `policy_id` → الوثيقة الأصلية (CASCADE DELETE)
- `new_policy_id` → الوثيقة الجديدة (**NO ACTION** - هذه المشكلة!)

عند محاولة حذف وثيقة محولة، يفشل لأن `new_policy_id` يشير إليها.

---

## الحل المطلوب

### الخطوة 1: حذف سجل السيارة المحذوفة ناعماً

```sql
DELETE FROM public.cars WHERE id = 'bf939a7d-a1d2-4f5f-a5bf-ce30bd39e935';
```

### الخطوة 2: تحديث Edge Function لحذف سجلات التحويل أولاً

**الملف**: `supabase/functions/delete-policy/index.ts`

إضافة خطوة جديدة قبل حذف الوثائق:

```typescript
// 8.5 Delete policy_transfers that reference these policies (as either policy_id or new_policy_id)
const { error: transfersError } = await supabase
  .from('policy_transfers')
  .delete()
  .or(`policy_id.in.(${allPolicyIds.join(',')}),new_policy_id.in.(${allPolicyIds.join(',')})`);

if (transfersError) {
  console.error('Error deleting policy transfers:', transfersError);
} else {
  console.log('Deleted policy transfers');
}
```

---

## ترتيب الحذف المُحدّث في Edge Function

```text
1. Unlock ELZAMI payments (locked=false)
2. Delete policy_payments
3. Delete ab_ledger entries
4. Delete customer_wallet_transactions
5. Delete customer_signatures
6. Soft-delete media_files
7. Delete accident_third_parties → accident_reports
8. Delete broker_settlement_items
9. ✨ NEW: Delete policy_transfers ✨  ← إضافة جديدة
10. Delete policies
```

---

## الملفات المتأثرة

| الملف/الإجراء | التغيير |
|---------------|---------|
| SQL Migration | حذف سيارة 3643670 نهائياً |
| `supabase/functions/delete-policy/index.ts` | إضافة حذف `policy_transfers` قبل حذف الوثائق |

---

## النتيجة المتوقعة

| السيناريو | قبل | بعد |
|-----------|-----|-----|
| إضافة سيارة برقم 3643670 | خطأ duplicate | يعمل ✅ |
| حذف وثيقة عادية (Admin) | يعمل ✅ | يعمل ✅ |
| حذف وثيقة محولة (Admin) | خطأ FK constraint ❌ | يعمل ✅ |
| حذف وثيقة ملغاة (Admin) | خطأ FK constraint ❌ | يعمل ✅ |
| حذف باقة محولة (Admin) | خطأ FK constraint ❌ | يعمل ✅ |
