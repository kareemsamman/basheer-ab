-- =====================================================
-- المرحلة 1: إنشاء نظام محفظة العميل (Customer Wallet)
-- =====================================================

-- 1.1 جدول دفعات العميل (client_payments)
-- كل الدفعات تدخل هنا مباشرة بدون ربط بوثيقة
CREATE TABLE IF NOT EXISTS public.client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('cash', 'cheque', 'transfer', 'visa')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cheque_number TEXT,
  cheque_image_url TEXT,
  notes TEXT,
  refused BOOLEAN DEFAULT FALSE,
  tranzila_transaction_id TEXT,
  branch_id UUID REFERENCES public.branches(id),
  created_by_admin_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.2 جدول ديون العميل (client_debits)
-- كل وثيقة غير إلزامي تضيف دين هنا
CREATE TABLE IF NOT EXISTS public.client_debits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- إنشاء indexes للأداء
CREATE INDEX IF NOT EXISTS idx_client_payments_client_id ON public.client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_payment_date ON public.client_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_client_payments_refused ON public.client_payments(refused) WHERE refused = true;
CREATE INDEX IF NOT EXISTS idx_client_debits_client_id ON public.client_debits(client_id);
CREATE INDEX IF NOT EXISTS idx_client_debits_policy_id ON public.client_debits(policy_id);

-- 1.3 RLS Policies للجداول الجديدة
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_debits ENABLE ROW LEVEL SECURITY;

-- سياسات client_payments
CREATE POLICY "Authenticated users can view client_payments"
  ON public.client_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert client_payments"
  ON public.client_payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update client_payments"
  ON public.client_payments FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete client_payments"
  ON public.client_payments FOR DELETE
  TO authenticated
  USING (true);

-- سياسات client_debits
CREATE POLICY "Authenticated users can view client_debits"
  ON public.client_debits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert client_debits"
  ON public.client_debits FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update client_debits"
  ON public.client_debits FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete client_debits"
  ON public.client_debits FOR DELETE
  TO authenticated
  USING (true);

-- 1.4 Function: حساب رصيد محفظة العميل
CREATE OR REPLACE FUNCTION public.get_client_wallet_balance(p_client_id UUID)
RETURNS TABLE (
  total_debits NUMERIC,
  total_credits NUMERIC,
  total_refunds NUMERIC,
  wallet_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debits NUMERIC;
  v_credits NUMERIC;
  v_refunds NUMERIC;
BEGIN
  -- مجموع الديون من client_debits
  SELECT COALESCE(SUM(amount), 0) INTO v_debits
  FROM client_debits
  WHERE client_id = p_client_id;

  -- مجموع الدفعات من client_payments (غير المرفوضة)
  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM client_payments
  WHERE client_id = p_client_id AND refused IS NOT TRUE;

  -- مجموع المرتجعات من customer_wallet_transactions
  SELECT COALESCE(SUM(amount), 0) INTO v_refunds
  FROM customer_wallet_transactions
  WHERE client_id = p_client_id;

  RETURN QUERY SELECT 
    v_debits AS total_debits,
    v_credits AS total_credits,
    v_refunds AS total_refunds,
    (v_debits - v_credits - v_refunds) AS wallet_balance;
END;
$$;

-- 1.5 Trigger: إضافة دين تلقائياً عند إنشاء وثيقة غير إلزامي
CREATE OR REPLACE FUNCTION public.add_policy_debit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- فقط إذا كانت الوثيقة ليست ELZAMI وليست broker deal وسعرها > 0
  IF NEW.policy_type_parent != 'ELZAMI' 
     AND NEW.broker_id IS NULL 
     AND COALESCE(NEW.insurance_price, 0) > 0 THEN
    INSERT INTO client_debits (client_id, policy_id, amount, description, branch_id)
    VALUES (
      NEW.client_id, 
      NEW.id, 
      NEW.insurance_price, 
      'وثيقة: ' || COALESCE(NEW.policy_type_parent::text, 'غير محدد'),
      NEW.branch_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ربط الـ trigger بجدول policies
DROP TRIGGER IF EXISTS trigger_add_policy_debit ON public.policies;
CREATE TRIGGER trigger_add_policy_debit
  AFTER INSERT ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION public.add_policy_debit();

-- 1.6 Trigger: تحديث updated_at في client_payments
CREATE OR REPLACE FUNCTION public.update_client_payments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_client_payments_updated_at ON public.client_payments;
CREATE TRIGGER trigger_client_payments_updated_at
  BEFORE UPDATE ON public.client_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_payments_updated_at();