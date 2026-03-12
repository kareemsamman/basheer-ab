

# Group Activity Log by Client

## Current Problem
Each activity (new client, new car, new package, payment) is shown as a separate card. The user wants all activities for the same client grouped into a single card, ordered chronologically (client created → car added → policy/package → payment).

## Approach

### File: `src/pages/ActivityLog.tsx`

**After fetching and sorting all `ActivityItem[]`, group them by `client_id`:**

1. Add a new interface `GroupedClientActivity`:
```typescript
interface GroupedClientActivity {
  clientId: string;
  clientName: string;
  clientFileNumber: string;
  latestDate: string;
  createdBy?: string;
  items: ActivityItem[]; // sorted oldest→newest within group
}
```

2. After `filteredActivities` is computed, add a `useMemo` that groups by `client_id`:
   - Activities without `client_id` remain as standalone cards
   - Activities with the same `client_id` are merged into one `GroupedClientActivity`
   - `latestDate` = most recent activity date (for sorting groups)
   - `items` sorted ascending by `created_at` (chronological: client → car → policy → payment)
   - Groups sorted descending by `latestDate`

3. **Render each group as ONE card:**
   - Card header: client name + file number + latest timestamp + createdBy
   - Inside: a timeline-style list of sub-items, each showing:
     - Icon (client/car/policy/payment) + action label + specific timestamp
     - Relevant details (package components, payment amount+type, car number, etc.)
   - Reuse existing rendering logic for each sub-item but in a compact inline format

4. Activities without a `client_id` (edge cases) render as standalone cards like before.

This is purely a rendering change — the data fetching stays the same.

