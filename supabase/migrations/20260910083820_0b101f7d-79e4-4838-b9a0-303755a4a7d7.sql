CREATE OR REPLACE FUNCTION public.sync_receipt_on_payment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_type IS DISTINCT FROM OLD.payment_type
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
     OR NEW.cheque_number IS DISTINCT FROM OLD.cheque_number
     OR NEW.cheque_date IS DISTINCT FROM OLD.cheque_date
     OR NEW.card_last_four IS DISTINCT FROM OLD.card_last_four THEN
    UPDATE receipts
    SET payment_method = NEW.payment_type::text,
        amount = NEW.amount,
        receipt_date = COALESCE(NEW.payment_date, receipt_date),
        cheque_number = NEW.cheque_number,
        cheque_date = NEW.cheque_date,
        card_last_four = NEW.card_last_four
    WHERE payment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_receipt_on_payment_update ON public.policy_payments;
CREATE TRIGGER trg_sync_receipt_on_payment_update
AFTER UPDATE ON public.policy_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_receipt_on_payment_update();