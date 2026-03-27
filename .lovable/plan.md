

## Fix Tranzila `create_document` Payload

The "Invalid item total sum value" error is caused by **wrong field names** in the payload. The current code uses invented field names that don't match the Tranzila Billing API schema. Here's what needs to change:

### Field Name Corrections

| Current (Wrong) | Correct (Per Docs) |
|---|---|
| `customer_name` | `client_name` |
| `vat_id` | `client_id` |
| `currency_set` | `document_currency_code` |
| `amount_type: 'G'` | Remove (use `price_type: 'G'` inside each item) |
| `language` | `document_language` |
| `quantity` | `units_number` |
| `unit_type: '1'` | `unit_type: 1` (number) |
| `price_per_unit` | `unit_price` |
| `item_type` | `type` |
| `credit_term` | `cc_credit_term` |
| `installments_number` | `cc_installments_number` |
| Missing `action` | Add `action: 1` |
| Missing `price_type` in item | Add `price_type: 'G'` |

### Response Parsing Fix

The response structure is `result.document.retrieval_key` and `result.document.id`, not `result.retrieval_key`.

### Implementation

**File: `supabase/functions/tranzila-create-invoice/index.ts`**

Replace the payload construction (lines 183-209) with the correct schema:

```typescript
const invoicePayload: Record<string, any> = {
  terminal_name: terminalName,
  document_type: 'RE',
  action: 1,
  document_language: 'heb',
  document_currency_code: 'ILS',
  client_name: client?.full_name || '',
  client_id: client?.id_number || '',
  items: [{
    type: 'I',
    name: itemDescription,
    unit_price: amt,
    units_number: 1,
    unit_type: 1,
    price_type: 'G',
    currency_code: 'ILS',
  }],
  payments: [{
    payment_method: Number(paymentMethod),
    payment_date: payment.payment_date,
    amount: amt,
    currency_code: 'ILS',
    ...(payment.payment_type === 'visa' ? {
      cc_last_4_digits: payment.card_last_four || '',
      cc_credit_term: 1,
      ...(payment.installments_count > 1 ? { cc_installments_number: payment.installments_count } : {}),
    } : {}),
  }],
};
```

Fix response parsing (lines 233-236):
```typescript
const doc = result.document;
const retrievalKey = doc.retrieval_key;
const documentId = doc.id;
```

Then redeploy the edge function.

