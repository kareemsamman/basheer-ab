DROP POLICY IF EXISTS "Authenticated users can update manual receipts" ON public.receipts;
CREATE POLICY "Authenticated users can update receipts"
ON public.receipts
FOR UPDATE
USING (true)
WITH CHECK (true);