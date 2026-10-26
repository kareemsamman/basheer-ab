# Visa receipts
- [x] Route single and bulk Visa printing to the original Tranzila receipt; preserve existing non-Visa receipts.
- [x] Verify successful and refused-payment behavior, deploy the two receipt functions, and check a real original receipt.

# Client file numbers
- [x] Make file-number generation skip existing numbers and verify consecutive allocations do not collide (authenticated allocations F1242 and F1243).

# Success-dialog payment invoices
- [ ] Exclude automatic חובה entries from receipt actions, share eligible-payment selection across print/SMS/WhatsApp, and surface the actual error.
- [ ] Run receipt-selection tests and verify available live printing.