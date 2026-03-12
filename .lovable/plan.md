

# Add Drag-and-Drop File Upload to Form Templates

## Problem
Currently, uploading files on `/form-templates` requires clicking "رفع ملف" button and using a dialog. The user wants a more flexible experience where they can simply drag and drop files directly onto the page.

## Changes

### `src/pages/FormTemplates.tsx`
1. **Add page-level drop zone** — when inside a folder (`currentFolderId` is set), the entire content area becomes a drop target for files
2. **Visual feedback** — when dragging files over the page, show a full-page overlay with a dashed border and upload icon indicating "drop files here"
3. **Direct upload on drop** — dropped files go through the same `handleUploadComplete` flow (upload via `FileUploader` logic, then insert into `form_template_files`)
4. **Handle the upload inline** — instead of opening the upload dialog, directly call the Supabase `upload-media` edge function for each dropped file, then insert the records

### Implementation Details
- Add `onDragOver`, `onDragLeave`, `onDrop` handlers to the main content `<div>`
- Add state `isDraggingOver` for the visual overlay
- On drop: validate files are PDF/image, upload each via the `upload-media` edge function, then insert rows into `form_template_files` and refresh
- Show toast on success/error
- The overlay will display "أسقط الملفات هنا للرفع" with an Upload icon
- When not inside a folder, show a toast saying files can only be uploaded inside folders

