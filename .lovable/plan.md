

# Fix: X-Service Invoice Files Should Open in New Tab

## Problem

The sync saves the X-Service invoice URL as `mime_type: "application/pdf"`, but the URL (`https://x-service.lovable.app/invoice/...`) is actually a web page, not a PDF file. When clicked, the `PdfJsViewer` tries to proxy-fetch it as a PDF binary, which fails with "Failed to load PDF".

## Solution

Detect **external links** (files where `storage_path` is null and `size` is 0) and handle them differently:
- Instead of opening in the PDF viewer, open them directly in a new tab
- Show a distinct visual indicator (link icon instead of PDF icon) so users know it's an external link

## Changes

### File: `src/components/policies/PolicyFilesSection.tsx`

In the `renderFileGrid` function, add a check before the PDF case: if the file has no `storage_path` (external link), open it directly in a new tab instead of trying to render it in the viewer.

```
// Before the isPdf check, add:
if (!file.storage_path && file.size === 0) {
  // External link - open directly
  window.open(file.cdn_url, '_blank');
  return;
}
```

Specifically:
1. In the grid rendering (around line 523), before the `isPdf` branch, check if `storage_path` is null -- if so, render it with a "link" icon and open in new tab on click
2. In the `FilePreviewGallery` component, external links should also just open in a new tab

### File: `src/components/policies/FilePreviewGallery.tsx`

No changes needed -- external link files won't reach the gallery since they'll open in a new tab directly.

## Technical Details

| What | Detail |
|---|---|
| Detection | `file.storage_path === null && file.size === 0` = external link |
| Action on click | `window.open(file.cdn_url, '_blank')` |
| Visual | Show an external link icon with "X-Service" label instead of "PDF" |
| Download button | Opens URL in new tab (user can print-to-PDF from the invoice page) |

This is a frontend-only change -- no edge function or database changes needed.
