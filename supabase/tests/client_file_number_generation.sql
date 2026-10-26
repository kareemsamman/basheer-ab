-- Run against the application database: allocates numbers but creates no clients.
DO $$
DECLARE
  first_number text := public.generate_file_number();
  second_number text := public.generate_file_number();
BEGIN
  IF first_number = second_number THEN
    RAISE EXCEPTION 'Consecutive file-number allocations must be distinct';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clients WHERE file_number IN (first_number, second_number)) THEN
    RAISE EXCEPTION 'Generated file numbers must not already belong to a client';
  END IF;
END;
$$;