-- Backfill NULL issue_date with start_date (or created_at as fallback)
UPDATE policies
SET issue_date = COALESCE(start_date, created_at::date)
WHERE issue_date IS NULL;

-- Add a trigger to auto-default issue_date on INSERT
CREATE OR REPLACE FUNCTION public.default_policy_issue_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.issue_date IS NULL THEN
    NEW.issue_date := COALESCE(NEW.start_date, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_issue_date ON policies;
CREATE TRIGGER trg_default_issue_date
  BEFORE INSERT ON policies
  FOR EACH ROW
  EXECUTE FUNCTION public.default_policy_issue_date();