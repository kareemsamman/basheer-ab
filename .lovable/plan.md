

# Plan: Rename Admin User + Add Hebrew Invoice Export to Expenses

## Task 1: Rename Admin User

Update the profile name for user `مستخدم 0546060886` (ID: `8a1401ed-8965-44d6-be97-4a66d84d3aec`) to **AB Admin** via a database migration.

## Task 2: Add Invoice Export Buttons to Expenses Page

Add an "Export Invoice" button for each tab (سند صرف / سند קבלה) that generates a professional Hebrew invoice HTML, similar to the existing `generate-invoice-pdf` edge function style, and opens it in a new tab for printing.

### What the Invoice Contains
- **Language**: Hebrew (LTR direction)
- **Logo**: AB Insurance logo from site settings
- **Title**: 
  - For receipts (سند قبض): **"קבלה"** (Receipt)
  - For payments (سند صرف): **"חשבונית זיכוי"** (Credit Invoice)
- **Content**: All filtered expenses currently showing in the table for that tab, **excluding** "المستحق للشركات" entries (company dues)
- **Layout**: Same professional style as the existing policy invoice (bordered sections, summary box, clean table)

### Invoice Fields
- Date range (month)
- Table of all vouchers: date, category, description, contact, payment method, amount
- Summary totals at the bottom
- AB Insurance branding with logo

### How It Works
1. Add an export button next to the tab filters (only visible on "receipt" or "payment" tabs, not "all" or "company_dues")
2. On click, filter the current expenses to exclude `is_company_due` items
3. Build an HTML string client-side (same pattern as the existing invoice HTML builder) in Hebrew with LTR direction
4. Open in a new tab with auto-print and auto-close on cancel

### Files to Change

| File | Change |
|---|---|
| **Database migration** | Update profile `full_name` to 'AB Admin' for the specific user |
| **`src/pages/Expenses.tsx`** | Add export invoice button and `buildExpenseInvoiceHtml()` function that generates Hebrew HTML invoice |

### Technical Details

#### Database Migration
```sql
UPDATE profiles SET full_name = 'AB Admin' WHERE id = '8a1401ed-8965-44d6-be97-4a66d84d3aec';
```

#### Expense Invoice HTML Builder (client-side in Expenses.tsx)
- Direction: `ltr`, lang: `he`
- Logo from site settings (`logo_url`)
- Title: "קבלה" for receipts, "חשבונית זיכוי" for payments
- Table headers in Hebrew: תאריך, קטגוריה, תיאור, גורם, אמצעי תשלום, סכום
- Category labels mapped to Hebrew
- Payment method labels mapped to Hebrew
- Summary box with total amount
- Same CSS styling as `generate-invoice-pdf` (sections, info-grid, summary-box gradient)
- Excludes all `is_company_due` entries from the export
- Print window with `onafterprint` auto-close

