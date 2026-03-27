

## Fix: `report_renewals_summary` Overload Ambiguity

The database has two overloaded versions of `report_renewals_summary`. When only `p_end_month` is passed, PostgreSQL cannot determine which function to call. The fix is to explicitly pass all 4 parameters with `null` defaults.

### Change

**File: `src/hooks/useRenewalsCount.tsx`** (line 14-16)

Replace the RPC call to include all required parameters:

```typescript
const { data, error } = await supabase.rpc('report_renewals_summary', {
  p_end_month: `${currentMonth}-01`,
  p_policy_type: null,
  p_created_by: null,
  p_search: null
});
```

This matches the 4-parameter function signature and resolves the `PGRST203` overload ambiguity error.

