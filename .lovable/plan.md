

## Problem

The Tranzila payment shows as "success" in your system even when Tranzila returns error code 004 (credit card rejected). This happens because of the `payment-result` edge function logic:

```
let finalStatus = status          // "success" from URL param
if (responseCode === '000') ...   // override to success  
else if (responseCode !== '') ... // override to failed
```

If Tranzila redirects to `success_url_address` but doesn't include the `Response` parameter in the URL, or if the iframe loads the success URL before the actual authorization completes, `finalStatus` defaults to `'success'` from the URL param — even though the real transaction failed.

## Solution

### 1. Never trust the URL `status` parameter
In `payment-result/index.ts`, change the logic so that without a confirmed `Response` code of `000` or `0`, it is **never** marked as success:

```
// OLD: let finalStatus = status (trusts URL param)
// NEW: default to 'pending', only success if Response=000/0
let finalStatus = 'pending'
if (responseCode === '000' || responseCode === '0') {
  finalStatus = 'success'
} else if (responseCode && responseCode !== '') {
  finalStatus = 'failed'  
}
```

### 2. Don't update database without Response code
Add a guard: if `finalStatus` is still `'pending'` (no Response code), don't update the payment record at all. The webhook or polling will handle it later.

### 3. Don't send success postMessage without confirmed Response
The HTML page's JavaScript should only post `status: 'success'` when `finalStatus === 'success'`, never for `'pending'`.

### Files to modify
- **`supabase/functions/payment-result/index.ts`** — Change default `finalStatus` from URL param to `'pending'`, guard DB update and postMessage accordingly
- **`supabase/functions/broker-payment-result/index.ts`** — Same fix for broker payments

### Impact
This ensures a payment is **only** marked as paid when Tranzila explicitly returns Response code `000`/`0`. No more false successes from URL parameter fallback.

