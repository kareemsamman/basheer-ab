INSERT INTO outside_cheques (name, cheque_number, amount, cheque_date, cheque_image_url, notes)
SELECT
  COALESCE(
    CASE WHEN e.entity_type = 'company' AND e.entity_id IS NOT NULL THEN (SELECT COALESCE(ic.name_ar, ic.name) FROM insurance_companies ic WHERE ic.id = e.entity_id)
         WHEN e.entity_type = 'broker' AND e.entity_id IS NOT NULL THEN (SELECT b.name FROM brokers b WHERE b.id = e.entity_id)
         WHEN e.entity_type = 'manual' THEN e.contact_name
    END,
    e.description,
    'شيك خارجي'
  ),
  e.reference_number,
  e.amount,
  e.expense_date,
  e.cheque_image_url,
  e.description
FROM expenses e
WHERE e.payment_method = 'cheque'
  AND e.reference_number IS NOT NULL
  AND e.reference_number != ''
  AND NOT EXISTS (
    SELECT 1 FROM outside_cheques oc WHERE oc.cheque_number = e.reference_number
  );