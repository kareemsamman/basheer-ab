

# Fix Receipts: Hebrew-only, Correct Company Name, Design Matching PDF, Date Filter

## Issues to Fix

1. **Company name**: Change from "בשיר אבו סנינה לביטוח ושיווק" to "בשיר אבו סנינה לביטוח" and English line to "BASHEER ABU SNEINEH INSURANCE" (everywhere)
2. **Subject bar**: Change from `ביטוח ${policyTypesText} / רכב...` to just `ביטוח רכב / רכב ${car_number} / ${client_name}` — no specific insurance type
3. **All text must be Hebrew**: Fix Arabic toast messages in Receipts.tsx (e.g. "تم تحديث القبض" → Hebrew), fix empty state text "لا توجد قبوضات" → Hebrew
4. **Receipt number starting from 01**: The SERIAL column starts from 1 by default, but it shows as "1". Need to pad it (e.g. `01`, `02`... `99`, `100`). Display with zero-padded format.
5. **Receipts page should show ALL payments**: Currently it only queries the `receipts` table. Need to also backfill existing payments or query `policy_payments` directly and merge with manual receipts.
6. **Date range filter**: Add from/to date pickers to the Receipts page

## Changes

### 1. `supabase/functions/generate-payment-receipt/index.ts`
- Line 340: `בשיר אבו סנינה לביטוח ושיווק` → `בשיר אבו סנינה לביטוח`
- Line 341: Already correct English name but verify it says "BASHEER ABU SNEINEH INSURANCE"
- Line 365-367: Subject bar → `ביטוח רכב${car?.car_number ? ` / רכב ${car.car_number}` : ''} / ${client?.full_name || ''}`
- Line 520: Receipt ID from payment UUID → look up `receipts` table for the `receipt_number` and pad it

### 2. `supabase/functions/generate-bulk-payment-receipt/index.ts`
- Same company name fix
- Same subject bar fix (just "ביטוח רכב")
- Same receipt number approach

### 3. `src/pages/Receipts.tsx`
- Fix all Arabic strings to Hebrew:
  - Toast messages: "تم تحديث القبض" → "הקבלה עודכנה", "تم إنشاء القבض" → "הקבלה נוצרה", "خطأ:" → "שגיאה:", "تم حذف القبض" → "הקבלה נמחקה", "لا توجد قبوضات" → "אין קבלות"
- Receipt number display: pad with leading zero for numbers < 10
- Add date range filter (from date / to date inputs) that filter `receipt_date`
- Print template: update company name to "בשיר אבו סנינה לביטוח"
- Ensure the query shows all receipts (auto + manual). The trigger already auto-creates receipts from payments, so the `receipts` table should have everything. We need a migration to backfill existing payments.

### 4. Database migration: Backfill existing payments
- Insert receipts for all existing `policy_payments` that don't have a receipt yet (excluding ELZAMI policies), so the receipts page shows historical data too.

### 5. Receipt number padding
- In edge functions: query `receipts` table by `payment_id` to get `receipt_number`, pad with leading zero
- In Receipts.tsx: display `String(r.receipt_number).padStart(2, '0')`

