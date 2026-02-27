

# Fix Accident Report: Editable Fields + PDF Page Extraction in Print

## Problems Identified

1. **Policy number and accident date are not editable** in the accident report form -- user needs to modify these directly on the report page
2. **PDF files render as black iframes** in the print view instead of being extracted as individual page images

## Solution

### 1. Add Editable Policy Number and Accident Date Fields

Add two inline-editable fields in the accident report form (under the policy info card or in the header area):

- **رقم البوليصة** - editable text input that updates `policies.policy_number` in the database
- **تاريخ الحادث** - editable date picker that updates `accident_reports.accident_date` in the database

Both fields will show the current value with an edit icon, and save on change. The updated values will automatically flow to the print header since `AccidentFilesSection` already receives these as props.

### 2. Fix PDF Rendering in Print - Extract Pages as Images

Instead of embedding PDFs as iframes (which render black in print), use **pdf.js** to:
- Load each PDF file
- Render each page to a canvas
- Convert each canvas to an image (toDataURL)
- Insert each page image as a full-page `<img>` in the print document

This means a 2-page PDF becomes 2 separate printed pages with proper content.

## Files to Change

| File | Change |
|---|---|
| `src/pages/AccidentReportForm.tsx` | Add editable policy number input and accident date picker in the form UI, with save handlers |
| `src/components/accident-reports/AccidentFilesSection.tsx` | Replace PDF iframe approach with pdf.js page-to-image extraction in `handlePrintAll` |

## Technical Details

### AccidentReportForm.tsx - Editable Fields

Add two editable fields below the policy info card:

```text
+------------------------------------------+
| رقم البوليصة: [editable input] [save]    |
| تاريخ الحادث: [date picker]    [save]    |
+------------------------------------------+
```

- Policy number: updates `policies.policy_number` via Supabase, then updates local state
- Accident date: updates `accident_reports.accident_date` via Supabase, then updates local state
- Both pass updated values down to `AccidentFilesSection` props

### AccidentFilesSection.tsx - PDF Page Extraction

Replace the current PDF iframe rendering in `handlePrintAll` with:

1. For each PDF file, fetch it via the proxy edge function (same as `PdfJsViewer` does)
2. Use `pdfjs-dist` (already installed) to load the PDF document
3. Loop through each page, render to canvas at print-quality resolution
4. Convert canvas to data URL (PNG)
5. Insert as `<img>` tags in the print HTML -- one per page, each on its own print page

```typescript
// Pseudocode for PDF extraction
const pdf = await pdfjsLib.getDocument(blobUrl).promise;
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const canvas = document.createElement('canvas');
  // render at 2x scale for print quality
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const imgDataUrl = canvas.toDataURL('image/png');
  // Add as <img> in print HTML
}
```

The print flow becomes async (shows a loading state while extracting pages), then opens the print window with all pages as images.
