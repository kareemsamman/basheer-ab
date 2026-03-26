
Goal: make “הפקת קבלה מ‑Tranzila” reliably return/open the Tranzila receipt link after a successful card payment.

What is actually broken (from current logs/code):
1) `tranzila-create-invoice` crashes on `response.json()` because Tranzila sometimes returns plain text (`"request too old"`), not JSON.  
2) The function then returns HTTP 500/400, which causes the generic UI error: “Edge Function returned a non-2xx status code”.  
3) `tranzila-webhook` often cannot map webhook callbacks to the payment (`Payment not found: <myid>`), so auto-creation of receipt links is skipped even when payment succeeded.

Implementation plan:
1. Harden `supabase/functions/tranzila-create-invoice/index.ts`
   - Parse Tranzila response safely: read `await response.text()` first, then JSON-parse conditionally.
   - Handle non-JSON provider responses explicitly (especially `"request too old"`), and return a clear logical error object.
   - Implement Tranzila-auth request freshness handling per API spec (timestamp/signature format), and add a one-time retry with a fresh signature when provider reports stale request.
   - Stop returning 4xx/5xx for provider/business failures; return HTTP 200 with `{ success: false, error, provider_raw }` so frontend can show exact reason.
   - Keep HTTP 500 only for true unexpected runtime crashes.

2. Fix callback-to-payment correlation in `supabase/functions/tranzila-webhook/index.ts`
   - Keep current `myid` lookup first.
   - Add fallback resolution: parse `payment_id` from `success_url_address` / `fail_url_address` fields in webhook payload when `myid` lookup fails.
   - If payment is found via fallback, proceed with payment update and non-blocking invoice creation.
   - Add structured logs for which lookup path succeeded (`myid` vs `payment_id_fallback`) for future debugging.

3. Improve frontend handling in `src/components/policies/PolicySuccessDialog.tsx`
   - In `handleTranzilaInvoice`, always prefer logical error text from `result.data.error` (and optional `provider_raw`) over generic invoke errors.
   - After successful generation, persist `tranzilaInvoiceUrl` and open it immediately (existing behavior kept).
   - On dialog open, refetch payments once after short delay (or after success callback) so newly written `tranzila_receipt_url` appears without manual refresh.

4. Validation checklist (end-to-end)
   - Complete a real card payment flow.
   - Verify `policy_payments.tranzila_receipt_url` is written.
   - Click “הפקת קבלה מ‑Tranzila” and confirm URL opens (no non-2xx toast).
   - Simulate provider stale response and confirm UI shows specific message, not generic edge-function failure.
   - Confirm webhook can recover via fallback when `myid` does not match.

Technical details / scope:
- No database migration required.
- No queue table/worker as first fix: current failure is parsing/auth-response handling + webhook correlation, not confirmed execution timeout.
- If provider timeouts persist after this fix, phase 2 can add queue-based async invoice generation (pending/completed job model) without changing UI contract.
