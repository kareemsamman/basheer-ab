

## Fix: `tranzila-create-invoice` edge function fails because `clients` table has no `email` column

### Problem
The edge function logs show: `column clients_2.email does not exist`. The `clients` table does not have an `email` column, but `tranzila-create-invoice` tries to select it in the Supabase query (line 76).

### Solution
Remove `email` from the select query in `tranzila-create-invoice/index.ts` and set `client_email_1` to empty string since clients don't have emails.

### Changes

**File: `supabase/functions/tranzila-create-invoice/index.ts`**
1. Line 76: Change `client:clients!inner(full_name, id_number, phone_number, email)` to `client:clients!inner(full_name, id_number, phone_number)`
2. Line 133: Change `client_email_1: client?.email || ''` to `client_email_1: ''`
3. Redeploy the function

### Technical Details
- The `clients` table columns: `full_name`, `id_number`, `phone_number`, `phone_number_2`, `birth_date`, `notes`, etc. -- no `email` field exists.
- This is a simple column reference fix, no database migration needed.

