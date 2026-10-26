CREATE OR REPLACE FUNCTION public.generate_file_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  next_num bigint;
  candidate text;
BEGIN
  LOOP
    next_num := nextval('public.client_file_number_seq'::regclass);
    candidate := 'F' || CASE WHEN next_num < 10000 THEN lpad(next_num::text, 4, '0') ELSE next_num::text END;
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE file_number = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$function$;