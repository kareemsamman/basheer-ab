

# Add Broker/Company Entity Selection to Expenses Voucher Form

## Problem
When creating a new voucher (سند جديد) on /expenses, the user can only type a free-text "اسم الجهة" (contact name). The user wants to be able to select a broker or company from existing records, so the expense is properly linked and the name auto-fills.

## Approach
Add an "entity source" selector to the voucher dialog that lets the user pick between: **يدوي** (manual/free text), **وسيط** (broker), or **شركة تأمين** (company). When broker or company is selected, show a dropdown of existing brokers/companies, and auto-fill the `contact_name` field.

No database migration needed — the `expenses` table already has `contact_name` (string) which is sufficient. We'll store the entity name there so it works with existing display/print logic.

## Changes

### 1. Database Migration — Add entity tracking columns
Add `entity_type` and `entity_id` columns to `expenses` table so we can track which broker/company the voucher is linked to (for future querying/reporting):
```sql
ALTER TABLE expenses ADD COLUMN entity_type text; -- 'broker' or 'company'
ALTER TABLE expenses ADD COLUMN entity_id uuid;
```

### 2. `src/pages/Expenses.tsx` — Update form dialog
- Add state: `entitySource` ('manual' | 'broker' | 'company'), `brokers[]`, `companies[]`
- Fetch brokers and companies on dialog open
- Add a 3-option selector row (manual / broker / company) below the voucher type selector
- When broker/company is selected, show a `Select` dropdown with their names
- On selection, auto-fill `contact_name` and store `entity_type` + `entity_id` in form data
- When manual is selected, show the existing free-text input
- Save `entity_type` and `entity_id` alongside the expense record

### 3. UI Layout in Dialog
```text
┌─────────────────────────────────┐
│  [سند قبض]    [سند صرف]        │  ← existing
├─────────────────────────────────┤
│  التصنيف: [dropdown]           │  ← existing
├─────────────────────────────────┤
│  الجهة:                        │  ← NEW
│  [يدوي] [وسيط] [شركة تأمين]   │
│  [Select broker/company ▼]     │  ← or free text input
├─────────────────────────────────┤
│  الوصف: [input]               │  ← existing
│  المبلغ / التاريخ / طريقة دفع │  ← existing
│  ...                           │
└─────────────────────────────────┘
```

### 4. Editing
When editing an existing expense that has `entity_type`/`entity_id`, pre-select the correct entity source and item.

