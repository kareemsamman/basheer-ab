

# Fix PDF Extraction in Print + Handle Print Cancellation

## Root Cause of PDF Failure

The PDF extraction is failing due to **pdfjs-dist v5** compatibility issues:

1. **Worker loading from CDN fails** due to CORS restrictions in the Vite environment. The CDN-hosted worker URL causes cross-origin errors.
2. **The `canvas` property** passed to `page.render()` is not part of the standard API and may cause issues in v5.

## Fix 1: PDF Worker Configuration

Replace the CDN worker URL with a Vite-compatible local import using `?url` suffix:

```typescript
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
```

This tells Vite to bundle the worker as a local asset, avoiding CORS entirely.

## Fix 2: Correct render() Call

Remove the non-standard `canvas` property from the render call:

```typescript
// Before (broken):
page.render({ canvasContext: ctx, viewport, canvas });

// After (correct):
page.render({ canvasContext: ctx, viewport });
```

## Fix 3: Print Cancellation Navigation

When the user cancels or finishes printing, the print window should close and the user stays on the accident report page. Currently `window.open("", "_blank")` opens a new tab. The fix:
- After `printWindow.print()` resolves (or the `afterprint` event fires), automatically close the print window tab so the user returns to the original accident report page.

## File to Change

| File | Change |
|---|---|
| `src/components/accident-reports/AccidentFilesSection.tsx` | Import worker locally with `?url`, fix `render()` call, auto-close print window after print/cancel |

## Technical Details

### Worker Import (top of file)
```typescript
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
```

This replaces the dynamic `import('pdfjs-dist')` inside `handlePrintAll` with a top-level static import, and uses the local Vite-resolved worker URL.

### Render Fix
```typescript
const renderTask = page.render({ canvasContext: ctx, viewport });
await renderTask.promise;
```

### Print Window Auto-Close
```typescript
printWindow.onafterprint = () => {
  printWindow.close();
};
// Also trigger print after load
printWindow.onload = () => {
  setTimeout(() => printWindow.print(), 500);
};
```

This ensures that whether the user prints or cancels, the print tab closes and they return to the accident report page.

