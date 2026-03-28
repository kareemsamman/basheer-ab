ALTER TABLE policy_payments DISABLE TRIGGER trg_validate_policy_payment_total;
UPDATE policy_payments SET refused = false WHERE payment_type = 'visa' AND refused = true;
ALTER TABLE policy_payments ENABLE TRIGGER trg_validate_policy_payment_total;