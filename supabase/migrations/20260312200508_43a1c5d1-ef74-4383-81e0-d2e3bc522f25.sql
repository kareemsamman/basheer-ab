
INSERT INTO public.receipts (receipt_type, source, client_name, client_id, car_number, car_id, amount, receipt_date, payment_id, policy_id)
SELECT
  CASE
    WHEN p.policy_type_parent = 'ACCIDENT_FEE_EXEMPTION' THEN 'accident_fee'
    ELSE 'payment'
  END AS receipt_type,
  'auto' AS source,
  COALESCE(c.full_name, 'לקוח') AS client_name,
  c.id AS client_id,
  car.car_number AS car_number,
  car.id AS car_id,
  pp.amount,
  pp.payment_date AS receipt_date,
  pp.id AS payment_id,
  pp.policy_id
FROM public.policy_payments pp
JOIN public.policies p ON p.id = pp.policy_id
LEFT JOIN public.clients c ON c.id = p.client_id
LEFT JOIN public.cars car ON car.id = p.car_id
WHERE p.policy_type_parent != 'ELZAMI'
  AND NOT EXISTS (
    SELECT 1 FROM public.receipts r WHERE r.payment_id = pp.id
  );
