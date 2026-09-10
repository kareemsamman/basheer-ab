
CREATE OR REPLACE FUNCTION public.auto_create_receipt_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_car_number TEXT;
  v_car_id UUID;
  v_client_id UUID;
  v_receipt_type TEXT;
  v_parent TEXT;
BEGIN
  -- Never create a receipt for a refused / failed payment
  IF COALESCE(NEW.refused, false) THEN
    RETURN NEW;
  END IF;

  SELECT p.client_id, p.car_id, p.policy_type_parent
  INTO v_client_id, v_car_id, v_parent
  FROM policies p
  WHERE p.id = NEW.policy_id;

  IF v_parent = 'ELZAMI' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_client_name FROM clients WHERE id = v_client_id;

  IF v_car_id IS NOT NULL THEN
    SELECT car_number INTO v_car_number FROM cars WHERE id = v_car_id;
  END IF;

  IF NEW.payment_type::text = 'accident_fee' OR v_parent = 'accident_fee' THEN
    v_receipt_type := 'accident_fee';
  ELSE
    v_receipt_type := 'payment';
  END IF;

  INSERT INTO receipts (
    receipt_type, source, client_name, client_id, car_number, car_id,
    amount, receipt_date, payment_id, policy_id, notes,
    payment_method, cheque_number, cheque_date, card_last_four
  ) VALUES (
    v_receipt_type, 'auto', COALESCE(v_client_name, 'לקוח'), v_client_id,
    v_car_number, v_car_id, NEW.amount, COALESCE(NEW.payment_date, now()::date),
    NEW.id, NEW.policy_id, NEW.notes, NEW.payment_type::text,
    NEW.cheque_number, NEW.cheque_date, NEW.card_last_four
  )
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_receipt_on_payment_refused()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_car_number TEXT;
  v_car_id UUID;
  v_client_id UUID;
  v_parent TEXT;
BEGIN
  IF COALESCE(NEW.refused, false) AND NOT COALESCE(OLD.refused, false) THEN
    DELETE FROM receipts WHERE payment_id = NEW.id AND source = 'auto';
  ELSIF NOT COALESCE(NEW.refused, false) AND COALESCE(OLD.refused, false) THEN
    SELECT p.client_id, p.car_id, p.policy_type_parent
    INTO v_client_id, v_car_id, v_parent
    FROM policies p WHERE p.id = NEW.policy_id;

    IF v_parent = 'ELZAMI' THEN
      RETURN NEW;
    END IF;

    SELECT full_name INTO v_client_name FROM clients WHERE id = v_client_id;
    IF v_car_id IS NOT NULL THEN
      SELECT car_number INTO v_car_number FROM cars WHERE id = v_car_id;
    END IF;

    INSERT INTO receipts (
      receipt_type, source, client_name, client_id, car_number, car_id,
      amount, receipt_date, payment_id, policy_id, notes,
      payment_method, cheque_number, cheque_date, card_last_four
    ) VALUES (
      'payment', 'auto', COALESCE(v_client_name, 'לקוח'), v_client_id,
      v_car_number, v_car_id, NEW.amount, COALESCE(NEW.payment_date, now()::date),
      NEW.id, NEW.policy_id, NEW.notes, NEW.payment_type::text,
      NEW.cheque_number, NEW.cheque_date, NEW.card_last_four
    )
    ON CONFLICT (payment_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_receipt_on_payment_refused() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_receipt_on_payment_refused ON public.policy_payments;
CREATE TRIGGER trg_receipt_on_payment_refused
AFTER UPDATE OF refused ON public.policy_payments
FOR EACH ROW EXECUTE FUNCTION public.handle_receipt_on_payment_refused();

ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_payment_id_fkey;
ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.policy_payments(id) ON DELETE CASCADE;
