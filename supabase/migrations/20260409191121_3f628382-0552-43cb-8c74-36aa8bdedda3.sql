
CREATE OR REPLACE FUNCTION public.auto_create_outside_cheque_from_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  -- Only for cheque payments with a cheque number
  IF NEW.payment_method != 'cheque' OR NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    RETURN NEW;
  END IF;

  -- Resolve name from entity
  IF NEW.entity_type = 'company' AND NEW.entity_id IS NOT NULL THEN
    SELECT COALESCE(name_ar, name) INTO v_name FROM insurance_companies WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'broker' AND NEW.entity_id IS NOT NULL THEN
    SELECT name INTO v_name FROM brokers WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'manual' AND NEW.contact_name IS NOT NULL THEN
    v_name := NEW.contact_name;
  END IF;

  v_name := COALESCE(v_name, NEW.description, 'شيك خارجي');

  INSERT INTO outside_cheques (name, cheque_number, amount, cheque_date, cheque_image_url, notes)
  VALUES (v_name, NEW.reference_number, NEW.amount, NEW.expense_date, NEW.cheque_image_url, NEW.description);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_outside_cheque_on_expense
  AFTER INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_outside_cheque_from_expense();
