
# Multi-Image Cheque Support

## Problem
1. When scanning a PDF with 3 pages or scanning 3 images, each cheque only gets ONE image (`cheque_image_url`), but the user wants ALL scanned pages to be accessible for each cheque
2. In the client profile (payments table), cheque images are shown as a simple link -- no gallery to browse all images

## Solution

### 1. Store all scan images per cheque in `payment_images` table

When cheques are saved from `AddCustomerChequeModal` (which receives data from the scanner), automatically insert ALL unique scan images from the batch into the `payment_images` table for each cheque payment record.

Currently the scanner uploads one full-page image per scanned page, and all cheques from that page share the same `image_url`. If 3 pages were scanned and 9 cheques detected, each cheque gets only its page's image. The fix will:

- Collect ALL unique `image_url` values from the scanner results
- After inserting cheque payments into `policy_payments`, also insert ALL scan images into `payment_images` for each payment record
- This way, every cheque in a batch has access to all scanned pages

### 2. Show cheque image gallery in Client Profile

In `ClientDetails.tsx`, replace the simple `cheque_image_url` link with a clickable thumbnail that opens a gallery dialog showing:
- The `cheque_image_url` (main image)
- All images from `payment_images` for that payment

Add an image gallery dialog (reuse the same pattern from Cheques page) with next/prev navigation.

### 3. Update `ChequeScannerDialog` to pass all image URLs

Currently `onConfirm` passes each cheque with its own `image_url`. Add a new field `all_scan_images` to the callback data so that `AddCustomerChequeModal` knows about ALL scanned page images, not just the one for this specific cheque.

## Files Changed

| File | Change |
|------|--------|
| `src/components/payments/ChequeScannerDialog.tsx` | Pass `all_scan_images` array (all unique CDN URLs from the scan batch) in the `onConfirm` callback |
| `src/components/cheques/AddCustomerChequeModal.tsx` | After inserting cheque payments, also insert all scan images into `payment_images` table for each payment |
| `src/components/clients/ClientDetails.tsx` | Fetch `payment_images` for cheque payments; show clickable thumbnails with gallery dialog instead of plain links |

## Flow After Fix

```text
User scans 3 pages (PDF or scanner)
  -> 3 images uploaded to CDN
  -> AI detects 9 cheques across 3 pages
  -> Each cheque gets its page's image_url
  -> All 3 CDN URLs collected as all_scan_images

User confirms and saves
  -> 9 policy_payments records created (each with cheque_image_url = its page)
  -> For each payment, 3 payment_images records created (all scan pages)

User views cheque in Cheques page or Client Profile
  -> Sees thumbnail of first image
  -> Clicks to open gallery with all 3 scan pages
  -> Can navigate between pages with arrows
```
