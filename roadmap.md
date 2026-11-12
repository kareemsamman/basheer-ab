# Price and transfer balance corrections
- [x] Corrected Wael's automatic compulsory payment and Amir's uncollected transfer payment/previously consumed refund; authenticated pages show ₪500 and ₪150 remaining.
- [x] Require explicit cash collection during transfer, preserve commission, refresh wallet; 8 tests passed and build OK.

# Restore pre-Tranzila printing
- [x] Restored the three printing files byte-for-byte to before cae6822, deployed both generators; authenticated report and single/bulk printing verified on the real ₪3,500 payment.
- [x] Confirmed the four November payments have no AB receipt records; the exclusion predates cae6822. Exact rollback restores AB payment confirmations, not missing numbered receipts. No payment or database record changed.

# Visa receipts
- [x] Route single and bulk Visa printing to the original Tranzila receipt; preserve existing non-Visa receipts.
- [x] Verify successful and refused-payment behavior, deploy the two receipt functions, and check a real original receipt.

# Client file numbers
- [x] Make file-number generation skip existing numbers and verify consecutive allocations do not collide (authenticated allocations F1242 and F1243).

# Success-dialog payment invoices
- [x] Exclude automatic חובה entries from receipt actions, share eligible-payment selection across print/SMS/WhatsApp, and surface the actual error.
- [x] Six selection/error tests passed; authenticated dialog check excluded the real automatic חובה entry and opened cash receipt 4561 through the print button.