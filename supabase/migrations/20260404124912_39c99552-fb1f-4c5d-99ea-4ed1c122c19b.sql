ALTER TABLE public.client_payments
ADD COLUMN card_last_four text;

-- Index for searching by card last four
CREATE INDEX idx_client_payments_card_last_four ON public.client_payments (card_last_four) WHERE card_last_four IS NOT NULL;