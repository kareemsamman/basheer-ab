CREATE OR REPLACE FUNCTION public.set_car_branch_from_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT branch_id INTO NEW.branch_id FROM public.clients WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_car_branch_from_client ON public.cars;
CREATE TRIGGER set_car_branch_from_client BEFORE INSERT OR UPDATE ON public.cars
FOR EACH ROW EXECUTE FUNCTION public.set_car_branch_from_client();