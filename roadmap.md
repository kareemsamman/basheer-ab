# Restore pre-Tranzila printing
- [ ] Restore the three printing files byte-for-byte to before cae6822, deploy and verify a real payment.
- [ ] Confirm whether the four November payments had AB receipt records before the routing change.

# Visa receipts
- [x] Route single and bulk Visa printing to the original Tranzila receipt; preserve existing non-Visa receipts.
- [x] Verify successful and refused-payment behavior, deploy the two receipt functions, and check a real original receipt.

# Client file numbers
- [x] Make file-number generation skip existing numbers and verify consecutive allocations do not collide (authenticated allocations F1242 and F1243).

# Success-dialog payment invoices
- [x] Exclude automatic חובה entries from receipt actions, share eligible-payment selection across print/SMS/WhatsApp, and surface the actual error.
- [x] Six selection/error tests passed; authenticated dialog check excluded the real automatic חובה entry and opened cash receipt 4561 through the print button.