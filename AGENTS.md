# Receipt routing
- Receipt generators share provider-receipt selection under `supabase/functions/_shared`; only open stored provider receipts for charged Visa payments to avoid duplicate issuance.

# Client numbering
- Generate client file numbers with the database sequence and check all existing clients, including archived clients, before returning a number; imports can put stored numbers ahead of the sequence.