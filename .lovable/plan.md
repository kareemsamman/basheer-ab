

# Enhance Receipts: Payment Method Details & Date Fix

## What the user wants
1. **Payment method details** on the printed receipt — show if paid by cash, visa, or cheque (with cheque number, amount, date)
2. **Current date** on the receipt "לכבוד" line instead of the receipt_date
3. **Company info already in Hebrew** — the images confirm this is working, no changes needed there

## Current state
- The `receipts` table has no `payment_method`, `cheque_number`, or `cheque_date` columns
- Manual receipts print with generic "תשלום" label — no payment method info
- Auto receipts have `payment_id` linking to `policy_payments` which has payment type/cheque info, but the local print builder doesn't use it
- The receipt date shows `receipt_date` instead of today's date

## Changes

### 1. Database migration — add payment columns to receipts
Add three columns:
- `payment_method TEXT` (cash/cheque/visa/transfer)
- `cheque_number TEXT`
- `cheque_date DATE`

Update the `auto_create_receipt_on_payment` trigger to copy `payment_type`, `cheque_number` from the inserted `policy_payments` row.

### 2. Update `src/pages/Receipts.tsx`
- Add `payment_method`, `cheque_number`, `cheque_date` to `ReceiptRow` interface
- Add form fields: payment method select (מזומן/שיק/כרטיס אשראי/העברה), conditional cheque number + cheque date inputs when method is "cheque"
- Include these in save payload
- Pass payment method info to the print builder
- For auto receipts with `payment_id`, fetch payment details from `policy_payments` before printing (to get cheque info)

### 3. Update `src/lib/receiptPrintBuilder.ts`
- Add `paymentMethod`, `chequeNumber`, `chequeDate` to `ReceiptPrintData`
- Show proper payment method label in the table (מזומן/שיק/כרטיס אשראי/העברה) instead of generic "תשלום"
- For cheques: show cheque number and date in the "פירוט" column
- Change the "תאריך" in the client row to use current date (today) instead of `data.receiptDate`

### 4. Summary of print output changes
- Payment method column: "מזומן" / "שיק" / "כרטיס אשראי" / "העברה בנקאית"
- Detail column for cheques: "שיק מס׳ 12345" with cheque date
- "לכבוד" date line → today's date

