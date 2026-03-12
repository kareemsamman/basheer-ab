

# Auto File Number + Client Files Tab

## Two Features

### 1. Auto-fetch next file number in ClientDrawer
When creating a new client (not editing), query the latest `file_number` from `clients` table and auto-populate the field with the next number.

**File**: `src/components/clients/ClientDrawer.tsx`
- In the `useEffect` that resets the form when `open` changes (line ~163), when `!isEditing`:
  - Query `clients` table: `SELECT file_number FROM clients WHERE file_number IS NOT NULL ORDER BY file_number DESC LIMIT 1`
  - Parse the number, increment by 1, and set as default `file_number`
  - Handle both numeric strings and edge cases

### 2. New "ملفات" (Files) tab in ClientDetails
Add a tab after "المرتجعات" that shows ALL files from all of the client's policies (both `policy_insurance` and `policy_crm` entity types), plus client-level uploaded files.

**New file**: `src/components/clients/ClientFilesTab.tsx`
- Props: `clientId: string`
- On mount, fetch all policy IDs for this client from `policies` table
- Then fetch all `media_files` where `entity_id IN policyIds` and `entity_type IN ('policy', 'policy_insurance', 'policy_crm')` and `deleted_at IS NULL`
- Also support uploading files directly to the client (`entity_type: 'client'`, `entity_id: clientId`) using the existing `FileUploader` component
- Display files in a grid with:
  - Policy number badge on each file
  - Filter by policy number / file type
  - Image preview, PDF preview via `FilePreviewGallery`
  - Download action

**File**: `src/components/clients/ClientDetails.tsx`
- Add new tab trigger after refunds: `<TabsTrigger value="files">ملفات</TabsTrigger>`
- Add `<TabsContent value="files">` rendering `<ClientFilesTab clientId={client.id} />`
- Import `ClientFilesTab`

### Technical Details
- File number auto-increment: query `MAX(CAST(file_number AS integer))` or sort descending and parse first result
- Client files tab reuses existing `FilePreviewGallery` and `FileUploader` components
- No database migration needed — uses existing `media_files` table with `entity_type: 'client'` for client-level uploads

