

## Problem

The Tranzila Visa payment fails immediately with `"column p.insurance_type does not exist"`. This error comes from the **`auto_create_receipt_on_payment` trigger** on the `policy_payments` table — NOT from the `tranzila-init` edge function itself.

When `tranzila-init` inserts a pending payment into `policy_payments`, this trigger fires and tries to read `p.insurance_type` from the `policies` table. But that column doesn't exist — the correct columns are `policy_type_parent` and `policy_type_child`. The insert fails, so the edge function returns a 500 error.

This was introduced in the recent migration (`20260314194008`) that created/updated the `auto_create_receipt_on_payment` function with the wrong column name.

## Fix

**One change**: Update the `auto_create_receipt_on_payment()` database function to use `p.policy_type_parent` instead of `p.insurance_type`.

Create a new migration that replaces the function definition, changing:
```sql
SELECT p.client_id, p.car_id, p.insurance_type
```
to:
```sql
SELECT p.client_id, p.car_id, p.policy_type_parent
```

This will fix both Visa payments and any other payment insertions that were silently failing to create receipts.

