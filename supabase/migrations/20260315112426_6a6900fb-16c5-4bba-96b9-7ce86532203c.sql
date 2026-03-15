CREATE OR REPLACE FUNCTION public.auto_create_receipt_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT p.client_id, p.car_id, p.policy_type_parent
  INTO v_client_id, v_car_id, v_receipt_type
  FROM policies p
  WHERE p.id = NEW.policy_id;

  SELECT full_name INTO v_client_name
  FROM clients WHERE id = v_client_id;

  IF v_car_id IS NOT NULL THEN
    SELECT car_number INTO v_car_number
    FROM cars WHERE id = v_car_id;
  END IF;

  IF NEW.payment_type::text = 'accident_fee' OR v_receipt_type = 'accident_fee' THEN
    v_receipt_type := 'accident_fee';
  ELSE
    v_receipt_type := 'payment';
  END IF;

  INSERT INTO receipts (
    receipt_type, source, client_name, client_id, car_number, car_id,
    amount, receipt_date, payment_id, policy_id, notes,
    payment_method, cheque_number, cheque_date, card_last_four
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
    NEW.payment_type::text,
    NEW.cheque_number,
    NEW.cheque_date,
    NEW.card_last_four
  );

  RETURN NEW;
END;
$function$;