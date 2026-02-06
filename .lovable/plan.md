

# إصلاح مشكلة ظهور Kareem Test في صفحة متابعة الديون

## المشكلة المكتشفة

**الأعراض:** العميل Kareem Test يظهر بمتبقي 2,200₪ في صفحة العميل، لكنه **لا يظهر** في صفحة `/debt-tracking`.

## تحليل السبب الجذري

### مقارنة البيانات

| المصدر | عدد السجلات | المجموع |
|--------|-------------|---------|
| `policy_payments` (الدفعات الفعلية) | 5 | 3,700₪ |
| `client_payments` (جدول المحفظة القديم) | 42 | 33,490₪ |

### تفاصيل الوثائق للعميل

| نوع التأمين | السعر | المدفوع (policy_payments) | المتبقي |
|-------------|-------|---------------------------|---------|
| ELZAMI | 1,200₪ | 1,200₪ | 0 |
| THIRD | 2,600₪ | 400₪ | **2,200₪** |
| ROAD_SERVICE | 300₪ | 300₪ | 0 |
| THIRD | 1,500₪ | 1,500₪ | 0 |
| ROAD_SERVICE | 300₪ | 300₪ | 0 |
| **المجموع** | **5,900₪** | **3,700₪** | **2,200₪** |

### المشكلة في الدالة

الدالة `get_client_balance` المُنشرة حالياً تقرأ من جدول `client_payments`:

```sql
-- الكود الحالي المُنشر (خاطئ)
SELECT COALESCE(SUM(amount), 0) as total_pay
FROM client_payments
WHERE client_id = p_client_id
```

هذا يُرجع 33,490₪ بدلاً من 3,700₪، مما يجعل الرصيد المتبقي = 0.

---

## الحل المقترح

### تحديث دالة `get_client_balance` لاستخدام `policy_payments`

جدول `policy_payments` هو مصدر الحقيقة للدفعات الفعلية المرتبطة بالوثائق.

```sql
CREATE OR REPLACE FUNCTION get_client_balance(p_client_id uuid)
RETURNS TABLE(
  total_insurance numeric,
  total_paid numeric,
  total_refunds numeric,
  total_remaining numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- All active policies (INCLUDING ELZAMI, EXCLUDING broker deals)
  active_policies AS (
    SELECT p.id, COALESCE(p.insurance_price, 0) AS insurance_price
    FROM policies p
    WHERE p.client_id = p_client_id
      AND COALESCE(p.cancelled, FALSE) = FALSE
      AND COALESCE(p.transferred, FALSE) = FALSE
      AND p.deleted_at IS NULL
      AND p.broker_id IS NULL
  ),
  -- Sum of all policy prices
  policy_totals AS (
    SELECT COALESCE(SUM(insurance_price), 0) AS total_ins
    FROM active_policies
  ),
  -- All non-refused payments for these policies (from policy_payments)
  payment_totals AS (
    SELECT COALESCE(SUM(pp.amount), 0) AS total_pay
    FROM policy_payments pp
    JOIN active_policies ap ON ap.id = pp.policy_id
    WHERE COALESCE(pp.refused, FALSE) = FALSE
  ),
  -- Wallet transactions (refunds reduce debt)
  wallet_totals AS (
    SELECT COALESCE(SUM(
      CASE 
        WHEN transaction_type IN ('refund', 'transfer_refund_owed', 'manual_refund') 
        THEN amount
        WHEN transaction_type = 'transfer_adjustment_due' 
        THEN -amount
        ELSE 0 
      END
    ), 0) AS total_ref
    FROM customer_wallet_transactions
    WHERE client_id = p_client_id
  )
  SELECT
    pt.total_ins::numeric AS total_insurance,
    pay.total_pay::numeric AS total_paid,
    wt.total_ref::numeric AS total_refunds,
    GREATEST(0, pt.total_ins - pay.total_pay - wt.total_ref)::numeric AS total_remaining
  FROM policy_totals pt
  CROSS JOIN payment_totals pay
  CROSS JOIN wallet_totals wt;
END;
$$;
```

---

## التغييرات المطلوبة

| الملف | التغيير |
|-------|---------|
| Migration SQL | تحديث دالة `get_client_balance` لاستخدام `policy_payments` بدلاً من `client_payments` |

---

## النتيجة المتوقعة

### قبل الإصلاح:
- `get_client_balance` يُرجع: `total_paid = 33,490`, `total_remaining = 0`
- Kareem Test **لا يظهر** في `/debt-tracking`

### بعد الإصلاح:
- `get_client_balance` يُرجع: `total_paid = 3,700`, `total_remaining = 2,200`
- Kareem Test **يظهر** في `/debt-tracking` مع متبقي 2,200₪

---

## ملاحظة مهمة

جدول `client_payments` يحتوي على بيانات اختبارية/مكررة (42 سجل بمجموع 33,490₪). بعد تطبيق هذا الإصلاح، يمكن النظر في:
1. حذف البيانات المكررة من `client_payments`
2. أو إبقاء الجدول للرجوع إليه لاحقاً

