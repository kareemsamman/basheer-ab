-- Receipts: add user-editable issue_date so cheques can be filtered/displayed
-- by their actual issuance date instead of created_at (auto) or receipt_date (cheque due date).

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS issue_date date;

-- Backfill existing rows from created_at
UPDATE public.receipts
SET issue_date = created_at::date
WHERE issue_date IS NULL;

-- New rows default to today; the app overrides this on insert when the user picks a date
ALTER TABLE public.receipts
  ALTER COLUMN issue_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS receipts_issue_date_idx
  ON public.receipts (issue_date);
