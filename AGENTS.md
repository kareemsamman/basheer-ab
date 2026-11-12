# Receipt routing
- Receipt generators and automatic printing retain the behavior before the provider-routing change; AB numbering comes only from stored receipts, so reverting printing must not invent receipt records or numbers.
- Success-dialog receipt actions share eligible-payment selection from `src/lib/receiptPayments`; automatic חובה entries must never become print or send targets.

# Client numbering
- Generate client file numbers with the database sequence and check all existing clients, including archived clients, before returning a number; imports can put stored numbers ahead of the sequence.

# Transfer accounting
- Keep transfer price differences separate from collection confirmation and preserve office commission on replacement policies; otherwise transfers can erase debt or invent cash payments.