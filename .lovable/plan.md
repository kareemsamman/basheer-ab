

# Fix: X-Service Invoice Not Saving to Policy Files

## Root Cause

The `media_files` table requires `storage_path` to be NOT NULL, but the edge function inserts `storage_path: null`. The Supabase JS client does not throw on insert errors -- it returns `{ data, error }` -- so the error is silently swallowed by the `try/catch`.

## Fix

Two changes needed:

### 1. Database: Make `storage_path` nullable
Since external links (like X-Service invoices) don't have a storage path, this column should allow NULL.

```sql
ALTER TABLE media_files ALTER COLUMN storage_path DROP NOT NULL;
```

### 2. Edge function: Properly check for insert errors

Change the insert block to log the actual error instead of only catching thrown exceptions:

```typescript
const { error: insertErr } = await supabase.from("media_files").insert({...});
if (insertErr) {
  console.error("[sync-to-xservice] Failed to save invoice URL:", insertErr.message);
} else {
  console.log("[sync-to-xservice] Saved invoice URL:", invoiceUrl);
}
```

### Files to change
| File | Change |
|---|---|
| Database migration | `ALTER TABLE media_files ALTER COLUMN storage_path DROP NOT NULL` |
| `supabase/functions/sync-to-xservice/index.ts` | Fix error handling on insert |

After this fix, any new X-Service policy sync will automatically save the invoice link to the policy files.

