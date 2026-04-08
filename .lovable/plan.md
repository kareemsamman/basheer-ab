

## Understanding: Receipts vs Accounting & The Duplicate Issue

### Receipts (`/receipts`)
A dedicated Hebrew receipt system using the `receipts` table. Auto-generates receipt numbers for policy payments, supports manual creation, groups by client/car/minute, and prints professional A4 Hebrew receipts.

### Accounting (`/accounting`)
An Arabic accounting ledger that **aggregates data from 6+ tables** into one unified view:

```text
┌─────────────────────────────────────────────────┐
│              ACCOUNTING DATA SOURCES             │
├──────────────┬──────────────────────────────────┤
│ Tab          │ Sources                          │
├──────────────┼──────────────────────────────────┤
│ Issuances    │ policies (grouped by group_id)   │
│ Refunds      │ policies (cancelled)             │
│              │ policy_payments (refused cheques) │
│              │ customer_wallet_transactions      │
│              │ expenses (voucher_type=refund)    │
│ Payments     │ expenses (voucher_type=payment)   │
│              │ company_settlements               │
│ Receipts     │ expenses (voucher_type=receipt)   │
│              │ policy_payments (customer pays)   │
│ Sales        │ expenses (desc starts [مبيعات])   │
└──────────────┴──────────────────────────────────┘
```

### The Duplicate Issue
The Accounting page can show the same transaction twice if:
1. A company settlement was created via the **Company Wallet** page (saved to `company_settlements`)
2. AND the same payment was also recorded as an **expense** (saved to `expenses` with entity_type=company)

Both get pulled into the "payment" tab independently.

### Clarification Needed
Before planning a fix, I need to understand: what specifically are you seeing duplicated? For example:
- Company settlements appearing twice (once from `company_settlements`, once from `expenses`)?
- Policy payments showing in both Receipts page AND Accounting page?
- Something else?

Could you show me an example of the duplicate entries, or tell me which entity type (company/broker/other) and which tab (payments/receipts) has the duplicates?

