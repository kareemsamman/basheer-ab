
-- Table to track renewal follow-up status at client+month level
CREATE TABLE public.renewal_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  follow_up_month date NOT NULL, -- first day of month e.g. 2026-03-01
  status text NOT NULL DEFAULT 'pending', -- pending, renewed, declined_renewal
  decline_reason text,
  updated_by uuid,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, follow_up_month)
);

-- Enable RLS
ALTER TABLE public.renewal_followups ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Active users can view renewal followups"
  ON public.renewal_followups FOR SELECT
  TO authenticated
  USING (is_active_user(auth.uid()));

CREATE POLICY "Active users can insert renewal followups"
  ON public.renewal_followups FOR INSERT
  TO authenticated
  WITH CHECK (is_active_user(auth.uid()));

CREATE POLICY "Active users can update renewal followups"
  ON public.renewal_followups FOR UPDATE
  TO authenticated
  USING (is_active_user(auth.uid()));

CREATE POLICY "Admins can delete renewal followups"
  ON public.renewal_followups FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups
CREATE INDEX idx_renewal_followups_month_status ON public.renewal_followups(follow_up_month, status);
CREATE INDEX idx_renewal_followups_client ON public.renewal_followups(client_id);
