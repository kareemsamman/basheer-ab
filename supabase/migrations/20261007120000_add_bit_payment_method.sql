-- Bit (Israeli payment app): a manual payment method recorded like a bank transfer.
-- Not connected to Tranzila.

ALTER TYPE public.payment_type ADD VALUE IF NOT EXISTS 'bit';

ALTER TABLE public.client_payments DROP CONSTRAINT IF EXISTS client_payments_payment_type_check;
ALTER TABLE public.client_payments ADD CONSTRAINT client_payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['cash'::text, 'cheque'::text, 'transfer'::text, 'visa'::text, 'bit'::text]));

ALTER TABLE public.broker_settlements DROP CONSTRAINT IF EXISTS broker_settlements_payment_type_check;
ALTER TABLE public.broker_settlements ADD CONSTRAINT broker_settlements_payment_type_check
  CHECK (payment_type = ANY (ARRAY['cash'::text, 'cheque'::text, 'bank_transfer'::text, 'visa'::text, 'bit'::text]));

CREATE OR REPLACE FUNCTION public.validate_expense_voucher_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.voucher_type NOT IN ('receipt', 'payment') THEN
    RAISE EXCEPTION 'voucher_type must be receipt or payment';
  END IF;
  IF NEW.payment_method NOT IN ('cash', 'cheque', 'bank_transfer', 'visa', 'bit') THEN
    RAISE EXCEPTION 'payment_method must be cash, cheque, bank_transfer, visa, or bit';
  END IF;
  RETURN NEW;
END;
$function$;
