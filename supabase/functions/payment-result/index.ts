import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This edge function handles payment result pages for Tranzila
// It returns simple HTML that posts a message to the parent window
// Also captures card details, installments, and sends SMS receipt

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'unknown'
  const paymentId = url.searchParams.get('payment_id') || ''
  
  // Get Tranzila response data if present
  const responseCode = url.searchParams.get('Response') || url.searchParams.get('response') || ''
  const confirmationCode = url.searchParams.get('ConfirmationCode') || url.searchParams.get('confirmationcode') || ''
  const tranzilaIndex = url.searchParams.get('index') || url.searchParams.get('Index') || ''
  const myid = url.searchParams.get('myid') || url.searchParams.get('Myid') || ''
  
  // Card and installment details from Tranzila
  const ccno = url.searchParams.get('ccno') || url.searchParams.get('Ccno') || '' // Card number (masked)
  const expdate = url.searchParams.get('expdate') || url.searchParams.get('Expdate') || '' // MMYY
  const npay = url.searchParams.get('npay') || url.searchParams.get('Npay') || '1' // Number of installments
  
  console.log('Payment result page loaded:', { 
    status, paymentId, responseCode, myid, 
    ccno: ccno ? `****${ccno.slice(-4)}` : 'none',
    expdate,
    npay
  })

  // Determine actual status from response code if available
  let finalStatus = status
  if (responseCode === '000' || responseCode === '0') {
    finalStatus = 'success'
  } else if (responseCode && responseCode !== '') {
    finalStatus = 'failed'
  }

  // Extract last 4 digits from card number (Tranzila returns format like 1234****5678)
  let cardLastFour = ''
  if (ccno && ccno.length >= 4) {
    cardLastFour = ccno.replace(/\*/g, '').slice(-4)
  }

  // Also update payment in database if we have the info
  let updatedPayment: any = null
  if (myid || paymentId) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      if (myid) {
        // Find payment by tranzila_index
        const { data: payment } = await supabase
          .from('policy_payments')
          .select('id, tranzila_response_code, policy_id')
          .eq('tranzila_index', myid)
          .single()

        if (payment && !payment.tranzila_response_code) {
          // Update payment status with card details
          if (finalStatus === 'success') {
            const { data: updated } = await supabase
              .from('policy_payments')
              .update({
                refused: false,
                tranzila_response_code: responseCode || '000',
                tranzila_approval_code: confirmationCode,
                tranzila_transaction_id: tranzilaIndex,
                card_last_four: cardLastFour || null,
                card_expiry: expdate || null,
                installments_count: npay ? parseInt(npay, 10) : 1,
              })
              .eq('id', payment.id)
              .select(`
                *,
                policy:policies!policy_id (
                  id,
                  policy_number,
                  client:clients!client_id (
                    id,
                    full_name,
                    phone_number
                  )
                )
              `)
              .single()
            
            updatedPayment = updated
            
            // Send SMS receipt if payment was successful
            if (updated?.policy?.client?.phone_number) {
              await sendPaymentReceiptSms(supabase, updated)
            }
          } else if (finalStatus === 'failed') {
            await supabase
              .from('policy_payments')
              .update({
                refused: true,
                tranzila_response_code: responseCode || 'FAILED',
              })
              .eq('id', payment.id)
          }
        }
      }
    } catch (e) {
      console.error('Error updating payment:', e)
    }
  }

  const isSuccess = finalStatus === 'success'
  
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSuccess ? 'تم الدفع بنجاح' : 'فشل الدفع'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, ${isSuccess ? '#f0fdf4' : '#fef2f2'} 0%, #ffffff 100%);
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${isSuccess ? '#dcfce7' : '#fee2e2'};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg {
      width: 48px;
      height: 48px;
      color: ${isSuccess ? '#16a34a' : '#dc2626'};
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: ${isSuccess ? '#16a34a' : '#dc2626'};
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .card-info {
      background: #f3f4f6;
      border-radius: 8px;
      padding: 12px;
      margin: 16px 0;
    }
    .card-info span {
      display: block;
      font-size: 14px;
      color: #374151;
    }
    .closing {
      font-size: 14px;
      color: #9ca3af;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      ${isSuccess 
        ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
      }
    </div>
    <h1>${isSuccess ? 'تمت عملية الدفع بنجاح!' : 'فشلت عملية الدفع'}</h1>
    <p>${isSuccess ? 'شكراً لك، تم استلام الدفع' : 'حدث خطأ أثناء معالجة الدفع'}</p>
    ${isSuccess && cardLastFour ? `
    <div class="card-info">
      <span>بطاقة: ****${cardLastFour}</span>
      ${parseInt(npay) > 1 ? `<span>عدد التقسيطات: ${npay}</span>` : ''}
    </div>
    ` : ''}
    <p class="closing">سيتم إغلاق هذه النافذة تلقائياً...</p>
  </div>
  
  <script>
    // Notify parent window of result
    function sendMessage() {
      try {
        var msg = {
          type: 'TRANZILA_PAYMENT_RESULT',
          status: '${finalStatus}',
          payment_id: '${paymentId}',
          card_last_four: '${cardLastFour}',
          installments: ${npay || 1}
        };
        
        // Try parent
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, '*');
        }
        // Try top (in case of nested iframes)
        if (window.top && window.top !== window) {
          window.top.postMessage(msg, '*');
        }
      } catch(e) {
        console.log('Could not post message:', e);
      }
    }
    
    // Send immediately and multiple times
    sendMessage();
    setTimeout(sendMessage, 100);
    setTimeout(sendMessage, 300);
    setTimeout(sendMessage, 500);
    setTimeout(sendMessage, 1000);
    setTimeout(sendMessage, 2000);
  </script>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
})

// Send SMS receipt to customer after successful payment
async function sendPaymentReceiptSms(supabase: any, payment: any) {
  try {
    const client = payment.policy?.client
    const policy = payment.policy
    
    if (!client?.phone_number) {
      console.log('No phone number for client, skipping SMS')
      return
    }

    // Get SMS settings
    const { data: smsSettings } = await supabase
      .from('sms_settings')
      .select('*')
      .single()

    if (!smsSettings?.is_enabled) {
      console.log('SMS is disabled, skipping receipt SMS')
      return
    }

    // Normalize phone number
    let phone = client.phone_number.replace(/\D/g, '')
    if (phone.startsWith('972')) {
      phone = '0' + phone.slice(3)
    } else if (phone.startsWith('+972')) {
      phone = '0' + phone.slice(4)
    }
    if (!phone.startsWith('0')) {
      phone = '0' + phone
    }

    // Build SMS message
    const amount = payment.amount
    const cardLast4 = payment.card_last_four || ''
    const installments = payment.installments_count || 1
    const policyNumber = policy?.policy_number || ''
    const clientName = client.full_name || ''
    const confirmationCode = payment.tranzila_approval_code || ''
    
    let message = `مرحباً ${clientName}،\n`
    message += `تم استلام دفعة بقيمة ₪${amount}`
    
    if (cardLast4) {
      message += ` عبر بطاقة ****${cardLast4}`
    }
    
    if (installments > 1) {
      message += ` على ${installments} تقسيطات`
    }
    
    if (policyNumber) {
      message += `\nرقم الوثيقة: ${policyNumber}`
    }
    
    if (confirmationCode) {
      message += `\nرقم التأكيد: ${confirmationCode}`
    }
    
    message += '\n\nشكراً لك - AB Insurance'

    // Send SMS via 019sms
    const smsUrl = 'https://019sms.co.il/api'
    const smsBody = new URLSearchParams({
      user: smsSettings.sms_user || '',
      password: smsSettings.sms_token || '',
      from: smsSettings.sms_source || 'AB-INS',
      to: phone,
      message: message,
    })

    console.log('Sending payment receipt SMS to:', phone)
    
    const smsResponse = await fetch(smsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: smsBody.toString(),
    })

    const smsResult = await smsResponse.text()
    console.log('SMS result:', smsResult)

  } catch (error) {
    console.error('Error sending payment receipt SMS:', error)
  }
}
