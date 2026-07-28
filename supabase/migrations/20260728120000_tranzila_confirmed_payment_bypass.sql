-- Tranzila payments are inserted as pending (refused = true), which skips the
-- insurance_price cap entirely, and are only flipped to refused = false once the
-- processor confirms the charge. By then the customer's card has already been
-- charged, so raising on the cap at that point does not prevent anything -- it just
-- leaves a real, collected payment stuck showing as "راجع" with no way to correct it.
--
-- Let that one transition through. Everything else (manual entries, cheques, plain
-- inserts, and any non-tranzila update) keeps the existing cap unchanged.

CREATE OR REPLACE FUNCTION public.validate_policy_payment_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_policy_price numeric;
  v_existing_total numeric;
  v_new_total numeric;
BEGIN
  -- Only validate for inserts/updates where payment is not refused
  IF COALESCE(NEW.refused, false) = true THEN
    RETURN NEW;
  END IF;

  -- Confirming an already-charged Tranzila payment: pending -> paid
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.refused, false) = true
     AND NEW.provider = 'tranzila' THEN
    RETURN NEW;
  END IF;

  -- Load policy price
  SELECT p.insurance_price
  INTO v_policy_price
  FROM public.policies p
  WHERE p.id = NEW.policy_id;

  IF v_policy_price IS NULL THEN
    RAISE EXCEPTION 'Policy not found for payment';
  END IF;

  -- Sum existing payments excluding refused and excluding current row (for updates)
  SELECT COALESCE(SUM(pp.amount), 0)
  INTO v_existing_total
  FROM public.policy_payments pp
  WHERE pp.policy_id = NEW.policy_id
    AND COALESCE(pp.refused, false) = false
    AND (TG_OP <> 'UPDATE' OR pp.id <> NEW.id);

  v_new_total := v_existing_total + COALESCE(NEW.amount, 0);

  IF v_new_total > v_policy_price THEN
    RAISE EXCEPTION 'Payment total exceeds policy insurance_price (total=%, price=%)', v_new_total, v_policy_price;
  END IF;

  RETURN NEW;
END;
$$;
