

# Upgrade Expenses Dialog: Auto-detect Entity & Multi-line Payment Form

## What Changes

### 1. Auto-select entity source from category
When user picks a category in the form:
- **"دفع لشركة تأمين"** (`insurance_company`) → auto-set entity source to **شركة تأمين**
- Add a new payment category **"دفع لوسيط"** (`broker_payment`) → auto-set entity source to **وسيط**
- Other categories → keep entity source as-is (default manual)

### 2. Multi-line payment form for broker/company entities
When entity source is **broker** or **company**, replace the current single amount/date/payment-method fields with the full multi-line payment system (same as BrokerWallet):
- **Payment lines** with type selector (cash, cheque, customer cheque, bank transfer, visa)
- **Split/installment** button
- **Cheque scanner** integration
- **Customer cheque selector** (for selecting waiting cheques from clients)
- **Cheque image upload** per cheque line
- **Receipt/voucher image upload** section
- Per-line date, amount, cheque number, bank reference fields
- **Total** display at bottom

When entity source is **manual**, keep the current simple single-payment form.

### 3. Save logic update
When saving with multi-line payments (broker/company), create one `expenses` row per payment line, all sharing the same `entity_type`, `entity_id`, `contact_name`, `category`, and `voucher_type`. Each row gets its own `amount`, `payment_method`, `expense_date`, and `reference_number`.

## Files to Change

### `src/pages/Expenses.tsx`
- Add `broker_payment` to `paymentCategories`
- Add category `onValueChange` handler to auto-set `entitySource` when `insurance_company` or `broker_payment` selected
- Add multi-line payment state: `paymentLines[]`, `splitPopoverOpen`, `splitCount`, `splitAmount`, `chequeScannerOpen`, `mainReceiptImages`
- Import `CustomerChequeSelector`, `ChequeScannerDialog`, `FileUploader`, `Popover`
- Conditionally render multi-line form (when entitySource is broker/company) vs simple form (manual)
- Add payment line CRUD helpers: `addPaymentLine`, `removePaymentLine`, `updatePaymentLine`, `handleSplitPayments`, `handleScannedCheques`
- Update `handleSubmit` to insert multiple expense rows for multi-line mode
- Reset multi-line state in `resetForm`

