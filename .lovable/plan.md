

# Redesign Payment Receipt — Hebrew Professional Layout (like reference image)

## Overview
Replace the current Arabic mobile-card-style payment receipt with a professional Hebrew A4 receipt matching the reference image style (Ihab Insurance / Morning-style). This affects **3 edge functions** that generate receipt HTML.

The new design will be:
- **Hebrew** (`lang="he"`, `dir="rtl"`)
- **A4 print-friendly** with clean professional layout
- AB Insurance logo from `site_settings.logo_url` (fetched from DB)
- Header with company name, tax ID, address
- Receipt number + date
- "לכבוד:" (To:) client name
- Subject bar (e.g. "רסום ביטוח/שם הלקוח")
- Payment details table with columns: אמצעי תשלום | פירוט | תאריך | סכום
- Total row
- Signature/stamp section
- Footer with digital signature note + generation timestamp

## Files to Change

### 1. `supabase/functions/generate-payment-receipt/index.ts`
- **Fetch logo**: Add query to `site_settings` for `logo_url` and to `sms_settings` for company details
- **Replace `PAYMENT_TYPE_LABELS`** with Hebrew: `cash→מזומן`, `cheque→שיק`, `visa→כרטיס אשראי`, `transfer→העברה בנקאית`
- **Replace `POLICY_TYPE_LABELS`** with Hebrew equivalents
- **Rewrite `buildPaymentReceiptHtml()`** completely:
  - A4 layout, Hebrew font (Arial/Tahoma), professional header with logo + "בשיר לביטוח ושיווק" + contact info
  - "קבלה" + receipt number (use payment ID prefix)
  - "לכבוד:" client name, date, "מקור" label
  - Light blue subject bar with policy description
  - Payment details table (single row for single receipt)
  - סה"כ total row with blue badge
  - Signature/stamp area with logo
  - Footer: generation timestamp, "חתימה דיגיטלית מאובטחת"
  - Print button (hidden in print)

### 2. `supabase/functions/generate-bulk-payment-receipt/index.ts`
- Same changes as above but adapted for multiple payments
- Payment table will have multiple rows (one per payment)
- Subject bar shows combined policy types
- Total sums all payments

### 3. `supabase/functions/payment-result/index.ts`
- This is the Tranzila iframe result page — **NOT a receipt**, just a status page
- **No changes needed** — this is correctly a simple success/failure indicator

### Design Details (matching reference image)

```text
┌──────────────────────────────────────────────┐
│  [LOGO]          בשיר לביטוח ושיווק          │
│                  עוסק מורשה XXXXXXX          │
│                  בית חנינא, ירושלים           │
├──────────────────────────────────────────────┤
│  קבלה XXXXX                        מקור      │
│  לכבוד: שם הלקוח                   DD/MM/YYYY│
├──────────────────────────────────────────────┤
│  ░░░ ביטוח / שם הלקוח ░░░  (blue bar)       │
├──────────────────────────────────────────────┤
│  ░░░ פרטי תשלומים ░░░  (blue header)         │
│  אמצעי תשלום | פירוט | תאריך | סכום          │
│  כרטיס אשראי | ויזה XXXX / רגיל | date | ₪X │
├──────────────────────────────────────────────┤
│  סה"כ  [₪X,XXX.00]                          │
│                                              │
│  [LOGO/STAMP]     :חתימה                     │
│                                              │
├──────────────────────────────────────────────┤
│  חתימה דיגיטלית מאובטחת                      │
│  הופק ב DD/MM/YYYY HH:mm | קבלה XXXXX       │
└──────────────────────────────────────────────┘
```

### Data Sources
- **Logo**: `site_settings.logo_url` (already stored as CDN URL)
- **Company info**: `sms_settings` (company_phone_links, company_location, company_email)
- **Payment/policy data**: Already fetched in both functions

