
DELETE FROM ab_ledger
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY reference_id, category, status ORDER BY id) as rn
    FROM ab_ledger
    WHERE category IN ('receivable_collected', 'receivable_reversal')
  ) sub
  WHERE rn > 1
);
