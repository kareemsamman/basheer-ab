import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Extract payment_id from success_url_address or fail_url_address query params.
 * URLs look like: https://…/payment-result?status=success&amp;payment_id=UUID
 * or:             https://…/payment-result?status=success&payment_id=UUID
 */
function extractPaymentIdFromUrls(data: Record<string, string>): string | null {
  for (const key of ['success_url_address', 'fail_url_address']) {
    const raw = data[key];
    if (!raw) continue;
    // Handle both & and &amp; encoded ampersands
    const cleaned = raw.replace(/&amp;/g, '&');
    try {
      const url = new URL(cleaned);
      const pid = url.searchParams.get('payment_id');
      if (pid) return pid;
    } catch {
      // Try regex fallback for malformed URLs
      const match = cleaned.match(/payment_id=([0-9a-f-]{36})/i);
      if (match) return match[1];
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new globalThis.Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse webhook data
    let data: Record<string, string> = {}
    
    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || ''
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData()
        formData.forEach((value, key) => { data[key] = value.toString() })
      } else if (contentType.includes('application/json')) {
        data = await req.json()
      } else {
        const text = await req.text()
        const params = new URLSearchParams(text)
        params.forEach((value, key) => { data[key] = value })
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      url.searchParams.forEach((value, key) => { data[key] = value })
    }

    console.log('Tranzila webhook received:', JSON.stringify(data))

    const responseCode = data.Response || data.response || data.ResponseCode
    const confirmationCode = data.ConfirmationCode || data.confirmationcode || data.ApprovalCode
    const tranzilaIndex = data.index || data.Index || data.TranzactionIndex
    const ourIndex = data.myid || data.Myid || data.myId

    // Skip if no response code at all
    if (!responseCode || responseCode === '') {
      console.log('No response code in webhook, skipping')
      return new globalThis.Response('OK', { status: 200, headers: corsHeaders })
    }

    // --- Payment lookup: try myid first, then fallback to payment_id from URL params ---
    let payment: any = null
    let lookupMethod = ''

    if (ourIndex) {
      const { data: found, error } = await supabase
        .from('policy_payments')
        .select('*, policies!inner(branch_id)')
        .eq('tranzila_index', ourIndex)
        .single()

      if (!error && found) {
        payment = found
        lookupMethod = 'myid'
      } else {
        console.log(`myid lookup failed for "${ourIndex}":`, error?.message)
      }
    }

    // Fallback: extract payment_id from success/fail URL
    if (!payment) {
      const fallbackId = extractPaymentIdFromUrls(data)
      if (fallbackId) {
        const { data: found, error } = await supabase
          .from('policy_payments')
          .select('*, policies!inner(branch_id)')
          .eq('id', fallbackId)
          .single()

        if (!error && found) {
          payment = found
          lookupMethod = 'payment_id_fallback'
          console.log(`Fallback lookup succeeded for payment_id: ${fallbackId}`)
        } else {
          console.error(`Fallback lookup also failed for payment_id "${fallbackId}":`, error?.message)
        }
      }
    }

    if (!payment) {
      console.error('Payment not found via any method. myid:', ourIndex)
      return new globalThis.Response('Payment not found', { status: 404, headers: corsHeaders })
    }

    console.log(`Payment found via ${lookupMethod}:`, payment.id)

    const policyBranchId = payment.policies?.branch_id || null

    // Already processed?
    if (payment.tranzila_response_code === '000' || payment.tranzila_response_code === '0' || payment.refused === false) {
      console.log('Payment already processed:', payment.id)
      return new globalThis.Response('OK', { status: 200, headers: corsHeaders })
    }

    const isSuccess = responseCode === '000' || responseCode === '0'

    if (isSuccess) {
      const { error: updateError } = await supabase
        .from('policy_payments')
        .update({
          refused: false,
          tranzila_transaction_id: tranzilaIndex,
          tranzila_approval_code: confirmationCode,
          tranzila_response_code: responseCode,
          branch_id: payment.branch_id || policyBranchId,
        })
        .eq('id', payment.id)

      if (updateError) {
        console.error('Failed to update payment:', updateError)
        return new globalThis.Response('Update failed', { status: 500, headers: corsHeaders })
      }

      console.log('Payment marked as paid:', payment.id)

      // Auto-create Tranzila invoice (non-blocking)
      try {
        const invoiceRes = await fetch(`${supabaseUrl}/functions/v1/tranzila-create-invoice`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ payment_id: payment.id }),
        })
        const invoiceResult = await invoiceRes.json()
        if (invoiceResult.success) {
          console.log('Tranzila invoice created:', invoiceResult.document_id)
        } else {
          console.log('Invoice creation skipped or failed:', invoiceResult.error || 'unknown')
        }
      } catch (invoiceErr) {
        console.error('Failed to create invoice (non-blocking):', invoiceErr)
      }
    } else {
      const { error: updateError } = await supabase
        .from('policy_payments')
        .update({
          tranzila_response_code: responseCode,
          refused: true,
          notes: payment.notes
            ? `${payment.notes}\nTranzila error: ${responseCode}`
            : `Tranzila error: ${responseCode}`,
        })
        .eq('id', payment.id)

      if (updateError) {
        console.error('Failed to update payment:', updateError)
      }

      console.log('Payment marked as failed:', payment.id, responseCode)
    }

    return new globalThis.Response('OK', { status: 200, headers: corsHeaders })

  } catch (error) {
    console.error('Error in tranzila-webhook:', error)
    return new globalThis.Response('Internal error', { status: 500, headers: corsHeaders })
  }
})
