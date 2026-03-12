
-- Create receipts table
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number SERIAL NOT NULL,
  receipt_type TEXT NOT NULL DEFAULT 'payment' CHECK (receipt_type IN ('payment', 'accident_fee')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  client_name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  car_number TEXT,
  car_id UUID REFERENCES public.cars(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  accident_date DATE,
  accident_details TEXT,
  payment_id UUID REFERENCES public.policy_payments(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payment_id)
);

-- Enable RLS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read all
CREATE POLICY "Authenticated users can view receipts"
  ON public.receipts FOR SELECT TO authenticated USING (true);

-- RLS: authenticated users can insert
CREATE POLICY "Authenticated users can insert receipts"
  ON public.receipts FOR INSERT TO authenticated WITH CHECK (true);

-- RLS: authenticated users can update manual receipts
CREATE POLICY "Authenticated users can update manual receipts"
  ON public.receipts FOR UPDATE TO authenticated USING (source = 'manual') WITH CHECK (source = 'manual');

-- RLS: authenticated users can delete manual receipts
CREATE POLICY "Authenticated users can delete manual receipts"
  ON public.receipts FOR DELETE TO authenticated USING (source = 'manual');

-- Index for lookups
CREATE INDEX idx_receipts_receipt_type ON public.receipts(receipt_type);
CREATE INDEX idx_receipts_payment_id ON public.receipts(payment_id);
CREATE INDEX idx_receipts_created_at ON public.receipts(created_at DESC);

-- Trigger function: auto-create receipt when a non-ELZAMI policy payment is inserted
CREATE OR REPLACE FUNCTION public.auto_create_receipt_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy_type TEXT;
  v_client_name TEXT;
  v_client_id UUID;
  v_car_number TEXT;
  v_car_id UUID;
  v_receipt_type TEXT := 'payment';
BEGIN
  -- Get policy type
  SELECT p.policy_type_parent, p.client_id, c.full_name, p.car_id, car.car_number
  INTO v_policy_type, v_client_id, v_client_name, v_car_id, v_car_number
  FROM policies p
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN cars car ON car.id = p.car_id
  WHERE p.id = NEW.policy_id;

  -- Skip ELZAMI policies
  IF v_policy_type = 'ELZAMI' THEN
    RETURN NEW;
  END IF;

  -- Check if it's accident fee exemption type
  IF v_policy_type = 'ACCIDENT_FEE_EXEMPTION' THEN
    v_receipt_type := 'accident_fee';
  END IF;

  -- Insert receipt
  INSERT INTO public.receipts (
    receipt_type, source, client_name, client_id, car_number, car_id,
    amount, receipt_date, payment_id, policy_id, created_by
  ) VALUES (
    v_receipt_type, 'auto', COALESCE(v_client_name, ''), v_client_id,
    v_car_number, v_car_id, NEW.amount,
    COALESCE(NEW.payment_date::date, CURRENT_DATE),
    NEW.id, NEW.policy_id, NEW.created_by_admin_id
  );

  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER trg_auto_receipt_on_payment
  AFTER INSERT ON public.policy_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_receipt_on_payment();
