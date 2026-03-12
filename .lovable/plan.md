

# Redesign Receipts Page Print to Match CDN Receipt + Add Copy Link

## Problem
The print template in `Receipts.tsx` uses a simple dark-header design without the logo, contact info, or the professional layout matching the CDN receipt (image-916.png). User also wants a "copy link" option.

## Changes

### 1. `src/pages/Receipts.tsx` — Rewrite `handlePrint` function
Replace the simple print HTML (lines 189-245) with the full professional design matching the edge function's `buildReceiptHtml`:
- Fetch logo URL from `site_settings` and company info from `sms_settings` (use existing hooks/queries)
- Header: Logo on right + company name "בשיר אבו סנינה לביטוח" / "BASHEER ABU SNEINEH INSURANCE" / tax ID + contact info on left
- Receipt meta: "קבלה" + padded number (red) + "מקור" badge
- "לכבוד:" client name + date
- Blue subject bar: "ביטוח רכב / רכב [number] / [client name]"
- For `accident_fee` type: show accident details in the table
- Payment details table with proper columns
- Total badge (dark blue)
- Signature section with logo stamp
- Footer with digital signature note + timestamp
- Print + share buttons (hidden in print)

### 2. `src/pages/Receipts.tsx` — Add "Copy Link" action
- Add a `receipt_url` column to the `receipts` table via migration
- Add a new action button (Link icon) in the table row actions
- When clicked for auto receipts that have a `payment_id`: call `generate-payment-receipt` edge function to generate CDN URL, store it in `receipt_url`, then copy to clipboard
- For manual receipts: generate receipt HTML, upload to CDN via a new edge function call, store URL, copy
- Show toast "הקישור הועתק" on success

### 3. Database migration
- Add `receipt_url TEXT` column to `receipts` table

### 4. Fetch logo + company settings
- Add queries at page level to fetch `site_settings.logo_url` and `sms_settings` (company_phone_links, company_location, company_email) for the print template

