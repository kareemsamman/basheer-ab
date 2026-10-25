# Receipt routing
- Receipt generators share provider-receipt selection under `supabase/functions/_shared`; only open stored provider receipts for charged Visa payments to avoid duplicate issuance.