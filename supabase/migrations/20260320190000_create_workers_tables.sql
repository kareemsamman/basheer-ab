-- Workers table (standalone HR, not related to app users)
CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  id_number text,
  phone text,
  notes text,
  branch_id uuid REFERENCES public.branches(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz DEFAULT NULL
);

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_workers_all" ON public.workers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_workers_deleted_at ON public.workers(deleted_at);

-- Worker salaries linked to expenses
CREATE TABLE public.worker_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year >= 2020),
  notes text,
  payment_method text NOT NULL DEFAULT 'cash',
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(worker_id, month, year)
);

ALTER TABLE public.worker_salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_worker_salaries_all" ON public.worker_salaries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_worker_salaries_worker ON public.worker_salaries(worker_id);
CREATE INDEX idx_worker_salaries_expense ON public.worker_salaries(expense_id);
