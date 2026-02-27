

# Add Policy Number and Accident Date to Print View

## What's Needed
When printing all accident files, the printed document should include a header on the first page (or every page) showing:
1. **رقم البوليصة** (Policy Number) - from the policy data
2. **تاريخ الحادث** (Accident Date) - from the accident report

## Changes

### 1. AccidentFilesSection.tsx - Accept new props and update print
- Add new props: `policyNumber`, `accidentDate`, `clientName`, `carNumber`, `companyName`
- Update `handlePrintAll` to render a header block on the first page before the files, showing the policy number and accident date
- The header will include report info styled for print

### 2. AccidentReportForm.tsx - Pass props to AccidentFilesSection
- Pass `policyNumber`, `accidentDate`, and other report info to `AccidentFilesSection`

## Files to Change

| File | Change |
|---|---|
| `src/components/accident-reports/AccidentFilesSection.tsx` | Add props for policy/report info, render header in print view |
| `src/pages/AccidentReportForm.tsx` | Pass policy number + accident date props to AccidentFilesSection |

## Technical Details

### AccidentFilesSection - New Props
```typescript
interface AccidentFilesSectionProps {
  accidentReportId: string;
  onFilesChange?: (count: number) => void;
  policyNumber?: string | null;
  accidentDate?: string | null;
  clientName?: string | null;
  carNumber?: string | null;
  companyName?: string | null;
  reportNumber?: number | null;
}
```

### Print Header (first page of printed document)
```text
+------------------------------------------+
|        بلاغ حادث - AB Insurance          |
|  رقم البوليصة: 12345                      |
|  تاريخ الحادث: 15/01/2026                |
|  العميل: أحمد محمد                        |
|  المركبة: 12-345-67                       |
|  شركة التأمين: هراءيل                     |
+------------------------------------------+
| [page break]                              |
| [file 1 - full page image]               |
| [page break]                              |
| [file 2 - full page PDF]                 |
+------------------------------------------+
```

### AccidentReportForm - Passing props
```tsx
<AccidentFilesSection
  accidentReportId={report.id}
  policyNumber={policy.policy_number}
  accidentDate={report.accident_date}
  clientName={policy.clients.full_name}
  carNumber={policy.cars?.car_number}
  companyName={policy.insurance_companies?.name_ar || policy.insurance_companies?.name}
  reportNumber={report.report_number}
/>
```

The header page will use clean, print-friendly styling with proper Arabic RTL layout and will appear as the first page before all uploaded files.
