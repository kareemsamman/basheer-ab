
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS cheque_image_url text,
  ADD COLUMN IF NOT EXISTS customer_cheque_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS receipt_images jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS batch_id text;
