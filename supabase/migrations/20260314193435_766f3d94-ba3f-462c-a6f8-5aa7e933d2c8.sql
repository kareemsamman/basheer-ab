
-- Add payment method columns to receipts
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS cheque_number TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS cheque_date DATE;

-- Update the auto-create trigger to copy payment info
CREATE OR REPLACE FUNCTION public.auto_create_receipt_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_car_number TEXT;
  v_policy_id TEXT;
  v_car_id TEXT;
  v_client_id TEXT;
  v_accident_date TEXT;
  v_accident_details TEXT;
  v_receipt_type TEXT;
BEGIN
  -- Get policy info
  SELECT p.client_id, p.car_id, p.insurance_type
  INTO v_client_id, v_car_id, v_receipt_type
  FROM policies p
  WHERE p.id = NEW.policy_id;

  -- Get client name
  SELECT full_name INTO v_client_name
  FROM clients WHERE id = v_client_id;

  -- Get car number
  IF v_car_id IS NOT NULL THEN
    SELECT car_number INTO v_car_number
    FROM cars WHERE id = v_car_id;
  END IF;

  -- Determine receipt type
  IF NEW.payment_type = 'accident_fee' OR v_receipt_type = 'accident_fee' THEN
    v_receipt_type := 'accident_fee';
  ELSE
    v_receipt_type := 'payment';
  END IF;

  INSERT INTO receipts (
    receipt_type, source, client_name, client_id, car_number, car_id,
    amount, receipt_date, payment_id, policy_id, notes,
    payment_method, cheque_number
  ) VALUES (
    v_receipt_type,
    'auto',
    COALESCE(v_client_name, 'לקוח'),
    v_client_id,
    v_car_number,
    v_car_id,
    NEW.amount,
    COALESCE(NEW.payment_date, now()::date),
    NEW.id,
    NEW.policy_id,
    NEW.notes,
    NEW.payment_type,
    NEW.cheque_number
  );

  RETURN NEW;
END;
$$;
