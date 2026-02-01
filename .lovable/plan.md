

# خطة: إصلاح خطأ "structure of query does not match function result type"

## المشكلة

بعد تطبيق الهجرة السابقة، تظهر رسالة خطأ:
- **"فشل في تحميل بيانات الديون"** 
- خطأ PostgreSQL: `structure of query does not match function result type`

### السبب:
في دالة `report_debt_policies_for_clients`، الأعمدة في جملة `SELECT` النهائية تستخدم أسماء مستعارة مختلفة عن تلك المُعرَّفة في `RETURNS TABLE`:

```sql
-- RETURNS TABLE يتوقع:
policy_id, client_id, car_id, car_number, policy_type_parent, policy_type_child...

-- لكن SELECT يُرجع:
pd.pid, pd.pclient, pd.pcar, pd.pcar_number, pd.ptype_parent, pd.ptype_child...
```

---

## الحل التقني

### تعديل دالة `report_debt_policies_for_clients`

تصحيح جملة SELECT النهائية لتستخدم أسماء الأعمدة الصحيحة كـ aliases:

```sql
SELECT 
  pd.pid AS policy_id,
  pd.pclient AS client_id,
  pd.pcar AS car_id,
  pd.pcar_number AS car_number,
  pd.ptype_parent AS policy_type_parent,
  pd.ptype_child AS policy_type_child,
  pd.pcompany AS company_name,
  pd.pstart AS start_date,
  pd.pend AS end_date,
  pd.pprice AS insurance_price,
  pd.ppaid AS total_paid,
  pd.premaining AS remaining,
  pd.pgroup AS group_id
FROM policy_data pd
WHERE pd.has_debt = true
ORDER BY pd.pclient, pd.pgroup NULLS LAST, pd.pstart DESC;
```

---

## ملخص التغييرات

| الملف | التغيير |
|-------|---------|
| `supabase/migrations/new_fix.sql` | إعادة إنشاء الدالة مع تصحيح أسماء الأعمدة |

---

## النتيجة المتوقعة

- سيختفي خطأ "فشل في تحميل بيانات الديون"
- ستعمل صفحة تتبع الديون بشكل صحيح
- **جهاد ابو خلف** سيختفي من قائمة الديون (لأن باقته مسددة)

