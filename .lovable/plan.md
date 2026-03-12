

# Fix Activity Log: Policy Labels, Arrow Direction, and Package Grouping

## Issues
1. **THIRD_FULL shows "شامل طرف ثالث"** — should show the child type ("شامل" or "ثالث") per system standard
2. **Arrow direction wrong** — shows `→` (right) but should be `←` (left) per system convention
3. **Package policies shown as separate items** — should be grouped by `group_id` into a single card showing total price, all components with their companies/prices

## Changes

### `src/pages/ActivityLog.tsx`

**1. Fix POLICY_TYPE_LABELS** (line 78): For `THIRD_FULL`, use child type resolution instead of the generic label.

**2. Fix policy label logic** (line 139): When `policy_type_parent === 'THIRD_FULL'`, use child label: `policy_type_child === 'FULL' ? 'شامل' : 'ثالث'` instead of the parent label.

**3. Fix arrow direction** (line 538): Change `→` to `←`.

**4. Add `group_id` to policy query** (line 122): Include `group_id` in the select.

**5. Group policies by `group_id`**: After fetching policies, group them by `group_id`. For grouped policies, create a single `ActivityItem` with type `"policy"` and action `"باقة جديدة"` that includes:
- New `details` fields: `components` array (each with type label, company, price, service name)
- `insurance_price` = sum of all component prices
- Single card per package instead of N separate cards

**6. Update `ActivityItem` interface**: Add optional `components` array field:
```typescript
components?: Array<{
  type_label: string;
  company_name: string;
  price: number;
  service_name?: string;
}>;
```

**7. Update rendering**: For activities with `components`, render a multi-line list showing each component with its company and price, plus a total.

**8. Fix payment label too**: Same child type resolution for payments (line ~193).

