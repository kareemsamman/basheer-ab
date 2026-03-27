-- Remove ambiguous overloaded function signature that causes PGRST203 in RPC resolution
DROP FUNCTION IF EXISTS public.report_renewals_summary(text, text, uuid, text);