-- The wizard records the ELZAMI price as a locked "system" payment on the ELZAMI policy.
-- Editing the ELZAMI price later left that payment at the old amount, so the
-- difference was counted as paid toward the rest of the package (THIRD_FULL,
-- services). Keep the automatic payment equal to the ELZAMI price.

-- 1. Locked payments stay immutable, except for this sync
CREATE OR REPLACE FUNCTION public.prevent_locked_payment_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.locked = true THEN
    IF current_setting('app.elzami_price_sync', true) = 'on'
       AND OLD.payment_type = NEW.payment_type
       AND OLD.payment_date = NEW.payment_date
       AND OLD.cheque_number IS NOT DISTINCT FROM NEW.cheque_number THEN
      RETURN NEW;
    END IF;
    IF OLD.payment_type != NEW.payment_type OR
       OLD.amount != NEW.amount OR
       OLD.payment_date != NEW.payment_date OR
       OLD.cheque_number IS DISTINCT FROM NEW.cheque_number THEN
      RAISE EXCEPTION 'Cannot modify locked payment. This is a system-generated payment.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.locked = true THEN
    RAISE EXCEPTION 'Cannot delete locked payment. This is a system-generated payment.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. ELZAMI price edited -> its automatic payment follows
CREATE OR REPLACE FUNCTION public.sync_elzami_auto_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.policy_type_parent <> 'ELZAMI'
     OR NEW.insurance_price IS NOT DISTINCT FROM OLD.insurance_price THEN
    RETURN NEW;
  END IF;

  -- Only when the policy has exactly one automatic payment
  IF (SELECT count(*) FROM public.policy_payments
      WHERE policy_id = NEW.id AND locked = true AND source = 'system') <> 1 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.elzami_price_sync', 'on', true);
  BEGIN
    UPDATE public.policy_payments
    SET amount = COALESCE(NEW.insurance_price, 0)
    WHERE policy_id = NEW.id AND locked = true AND source = 'system';
  EXCEPTION WHEN OTHERS THEN
    -- e.g. the package is already overpaid: keep the price edit, skip the sync
    RAISE WARNING 'ELZAMI auto payment not synced for policy %: %', NEW.id, SQLERRM;
  END;
  PERFORM set_config('app.elzami_price_sync', 'off', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_elzami_auto_payment ON public.policies;
CREATE TRIGGER trg_sync_elzami_auto_payment
  AFTER UPDATE OF insurance_price ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.sync_elzami_auto_payment();

-- 3. Fix ELZAMI policies already edited (one automatic payment, amount differs)
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('app.elzami_price_sync', 'on', true);
  FOR r IN
    SELECT pp.id, pol.insurance_price
    FROM public.policy_payments pp
    JOIN public.policies pol ON pol.id = pp.policy_id
    WHERE pol.policy_type_parent = 'ELZAMI'
      AND pol.deleted_at IS NULL
      AND pp.locked = true AND pp.source = 'system'
      AND pp.amount <> pol.insurance_price
      AND (SELECT count(*) FROM public.policy_payments x
           WHERE x.policy_id = pp.policy_id AND x.locked = true AND x.source = 'system') = 1
  LOOP
    BEGIN
      UPDATE public.policy_payments SET amount = r.insurance_price WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ELZAMI auto payment % not synced: %', r.id, SQLERRM;
    END;
  END LOOP;
  PERFORM set_config('app.elzami_price_sync', 'off', true);
END;
$$;
