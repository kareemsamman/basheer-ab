-- Receipts: one gap-free number per action, cancel instead of delete.
--
-- Before: every payment row took its own number from a sequence, so an action
-- with two cheques printed "קבלה 4519" while the list showed 4519-4520, and
-- every failed save, ON CONFLICT or deleted receipt burned a number (4524-4526
-- were never stored). ELZAMI placeholders (locked "system" cash payments) and
-- ₪0 payments also took numbers that the Receipts page then hid.
--
-- After:
--   * receipts rows stay one per payment line, but all the lines one employee
--     records for one client within 2 minutes share ONE receipt_number.
--   * numbers come from MAX()+1 under a transaction lock: a rolled-back save
--     uses no number, so the series has no gaps from here on.
--   * no receipt for ELZAMI placeholders, ₪0/negative amounts, or card
--     payments charged through Tranzila (Tranzila issues their receipt).
--   * a refused or deleted payment cancels its receipt (מבוטלת) instead of
--     deleting it, so its number stays visible.
-- Existing numbers are not changed: they are already printed and handed out.

-- 1. Columns ---------------------------------------------------------------
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS legacy_numbering boolean NOT NULL DEFAULT false;

-- Rows numbered by the old one-number-per-payment rule (the Receipts page
-- keeps grouping them by minute as before)
UPDATE public.receipts SET legacy_numbering = true WHERE NOT legacy_numbering;

-- The receipt's date is the Israel day it was issued (CURRENT_DATE is UTC)
ALTER TABLE public.receipts
  ALTER COLUMN issue_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Jerusalem')::date);

-- 2. Numbering -------------------------------------------------------------
ALTER TABLE public.receipts ALTER COLUMN receipt_number DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.assign_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_number integer;
BEGIN
  -- One numbering at a time; held until commit, so the MAX below sees the
  -- previous issuer's committed row and a rollback leaves no gap.
  PERFORM pg_advisory_xact_lock(hashtext('public.receipts.receipt_number'));

  -- A payment line joins the receipt its client got from the same employee
  -- in the last 2 minutes: the payments of one action share one number.
  IF NEW.source = 'auto' AND NEW.client_id IS NOT NULL AND NEW.payment_id IS NOT NULL THEN
    SELECT pp.created_by_admin_id INTO v_creator
    FROM policy_payments pp WHERE pp.id = NEW.payment_id;

    SELECT r.receipt_number INTO v_number
    FROM receipts r
    JOIN policy_payments pp ON pp.id = r.payment_id
    WHERE r.source = 'auto'
      AND NOT r.legacy_numbering
      AND r.cancelled_at IS NULL
      AND r.client_id = NEW.client_id
      AND r.receipt_type = NEW.receipt_type
      AND pp.created_by_admin_id IS NOT DISTINCT FROM v_creator
      AND r.created_at >= now() - interval '2 minutes'
    ORDER BY r.created_at DESC, r.receipt_number DESC
    LIMIT 1;
  END IF;

  IF v_number IS NULL THEN
    SELECT COALESCE(MAX(receipt_number), 0) + 1 INTO v_number FROM receipts;
  END IF;

  -- The number is never taken from the caller
  NEW.receipt_number := v_number;
  NEW.legacy_numbering := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_receipt_number ON public.receipts;
CREATE TRIGGER trg_assign_receipt_number
  BEFORE INSERT ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.assign_receipt_number();

-- A receipt's number never changes once issued
CREATE OR REPLACE FUNCTION public.keep_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.receipt_number := OLD.receipt_number;
  NEW.legacy_numbering := OLD.legacy_numbering;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_receipt_number ON public.receipts;
CREATE TRIGGER trg_keep_receipt_number
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.keep_receipt_number();

-- 3. Which payments get a receipt -------------------------------------------
CREATE OR REPLACE FUNCTION public.create_receipt_for_payment(p public.policy_payments)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_car_number text;
  v_car_id uuid;
  v_client_id uuid;
  v_parent text;
BEGIN
  -- Refused / failed: no money received
  IF COALESCE(p.refused, false) THEN RETURN; END IF;
  -- ELZAMI placeholder recorded by the wizard: the office never receives it
  IF COALESCE(p.locked, false) OR p.source = 'system' THEN RETURN; END IF;
  -- Nothing received (₪0) or money paid back
  IF COALESCE(p.amount, 0) <= 0 THEN RETURN; END IF;
  -- Card charged through Tranzila: Tranzila issues the receipt
  IF p.payment_type::text = 'visa'
     AND (p.tranzila_transaction_id IS NOT NULL OR p.tranzila_response_code IS NOT NULL) THEN
    RETURN;
  END IF;

  SELECT pol.client_id, pol.car_id, pol.policy_type_parent
  INTO v_client_id, v_car_id, v_parent
  FROM policies pol WHERE pol.id = p.policy_id;

  IF v_parent = 'ELZAMI' THEN RETURN; END IF;

  SELECT full_name INTO v_client_name FROM clients WHERE id = v_client_id;
  IF v_car_id IS NOT NULL THEN
    SELECT car_number INTO v_car_number FROM cars WHERE id = v_car_id;
  END IF;

  INSERT INTO receipts (
    receipt_type, source, client_name, client_id, car_number, car_id,
    amount, receipt_date, payment_id, policy_id, notes,
    payment_method, cheque_number, cheque_date, card_last_four
  ) VALUES (
    CASE WHEN p.payment_type::text = 'accident_fee' THEN 'accident_fee' ELSE 'payment' END,
    'auto', COALESCE(v_client_name, 'לקוח'), v_client_id, v_car_number, v_car_id,
    p.amount, COALESCE(p.payment_date, (now() AT TIME ZONE 'Asia/Jerusalem')::date),
    p.id, p.policy_id, p.notes,
    p.payment_type::text, p.cheque_number, p.cheque_date, p.card_last_four
  )
  ON CONFLICT (payment_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_receipt_for_payment(public.policy_payments) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auto_create_receipt_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_receipt_for_payment(NEW);
  RETURN NEW;
END;
$$;

-- Refused (returned cheque, failed card): cancel. Un-refused: restore the
-- cancelled receipt, or issue one (a Tranzila card payment is inserted as
-- refused and flipped once charged — it gets no receipt of ours).
CREATE OR REPLACE FUNCTION public.handle_receipt_on_payment_refused()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.refused, false) AND NOT COALESCE(OLD.refused, false) THEN
    UPDATE receipts
    SET cancelled_at = now(), cancel_reason = 'התשלום נדחה / שיק חוזר', updated_at = now()
    WHERE payment_id = NEW.id AND source = 'auto' AND cancelled_at IS NULL;
  ELSIF NOT COALESCE(NEW.refused, false) AND COALESCE(OLD.refused, false) THEN
    IF EXISTS (SELECT 1 FROM receipts WHERE payment_id = NEW.id) THEN
      UPDATE receipts
      SET cancelled_at = NULL, cancel_reason = NULL, updated_at = now()
      WHERE payment_id = NEW.id AND cancel_reason = 'התשלום נדחה / שיק חוזר';
    ELSE
      PERFORM create_receipt_for_payment(NEW);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Deleted payment: its receipt stays, cancelled (the FK then clears payment_id)
CREATE OR REPLACE FUNCTION public.cancel_receipt_on_payment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE receipts
  SET cancelled_at = now(), cancel_reason = 'התשלום נמחק', updated_at = now()
  WHERE payment_id = OLD.id AND cancelled_at IS NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_receipt_on_payment_delete ON public.policy_payments;
CREATE TRIGGER trg_cancel_receipt_on_payment_delete
  BEFORE DELETE ON public.policy_payments
  FOR EACH ROW EXECUTE FUNCTION public.cancel_receipt_on_payment_delete();

-- 4. Existing receipts that never were money received -> מבוטלת -----------------
UPDATE public.receipts r
SET cancelled_at = now(), cancel_reason = 'דמי חובה – לא התקבל כסף במשרד'
FROM public.policy_payments pp
WHERE pp.id = r.payment_id AND r.cancelled_at IS NULL
  AND (COALESCE(pp.locked, false) OR pp.source = 'system');

UPDATE public.receipts r
SET cancelled_at = now(), cancel_reason = 'דמי חובה – לא התקבל כסף במשרד'
FROM public.policy_payments pp
JOIN public.policies pol ON pol.id = pp.policy_id
WHERE pp.id = r.payment_id AND r.cancelled_at IS NULL
  AND pol.policy_type_parent = 'ELZAMI';

UPDATE public.receipts
SET cancelled_at = now(), cancel_reason = 'סכום 0 / החזר'
WHERE cancelled_at IS NULL AND source = 'auto' AND amount <= 0;

UPDATE public.receipts
SET cancelled_at = now(), cancel_reason = 'התשלום נמחק'
WHERE cancelled_at IS NULL AND source = 'auto' AND payment_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_receipt_number ON public.receipts (receipt_number);
CREATE INDEX IF NOT EXISTS idx_receipts_client_created ON public.receipts (client_id, created_at DESC);
