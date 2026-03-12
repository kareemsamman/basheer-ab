

# Filter Cheques Page to 2026+ Only

Add `.gte('payment_date', '2026-01-01')` to both queries in `src/pages/Cheques.tsx`:

### 1. `fetchSummaryStats` (~line 239)
Add filter after `.eq('payment_type', 'cheque')`:
```typescript
.gte('payment_date', '2026-01-01')
```

### 2. `fetchCheques` (~line 311)
Add filter after `.eq('payment_type', 'cheque')`:
```typescript
.gte('payment_date', '2026-01-01')
```

This ensures both the summary cards and the cheque list only show data from January 1, 2026 onwards, consistent with the global accounting fresh-start date.

