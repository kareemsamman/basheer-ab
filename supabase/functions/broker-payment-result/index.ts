import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This edge function handles payment result pages for broker Tranzila payments
// It returns simple HTML that posts a message to the parent window

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'unknown'
  const settlementId = url.searchParams.get('settlement_id') || ''
  
  // Get Tranzila response data if present
  const responseCode = url.searchParams.get('Response') || url.searchParams.get('response') || ''
  const confirmationCode = url.searchParams.get('ConfirmationCode') || url.searchParams.get('confirmationcode') || ''
  const tranzilaIndex = url.searchParams.get('index') || url.searchParams.get('Index') || ''
  const myid = url.searchParams.get('myid') || url.searchParams.get('Myid') || ''
  
  // Card and installment details
  const ccno = url.searchParams.get('ccno') || url.searchParams.get('Ccno') || ''
  const expdate = url.searchParams.get('expdate') || url.searchParams.get('Expdate') || ''
  const npay = url.searchParams.get('npay') || url.searchParams.get('Npay') || '1'
  
  console.log('Broker payment result page loaded:', { 
    status, settlementId, responseCode, myid, 
    ccno: ccno ? `****${ccno.slice(-4)}` : 'none',
    expdate,
    npay
  })

  // Determine actual status from response code
  let finalStatus = status
  if (responseCode === '000' || responseCode === '0') {
    finalStatus = 'success'
  } else if (responseCode && responseCode !== '') {
    finalStatus = 'failed'
  }

  // Extract last 4 digits from card number
  let cardLastFour = ''
  if (ccno && ccno.length >= 4) {
    cardLastFour = ccno.replace(/\*/g, '').slice(-4)
  }

  // Update settlement in database
  if (settlementId) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const { data: settlement } = await supabase
        .from('broker_settlements')
        .select('id, status')
        .eq('id', settlementId)
        .single()

      if (settlement && settlement.status === 'pending') {
        if (finalStatus === 'success') {
          await supabase
            .from('broker_settlements')
            .update({
              status: 'completed',
              refused: false,
              tranzila_approval_code: confirmationCode,
              card_last_four: cardLastFour || null,
              card_expiry: expdate || null,
              installments_count: npay ? parseInt(npay, 10) : 1,
            })
            .eq('id', settlementId)
        } else if (finalStatus === 'failed') {
          await supabase
            .from('broker_settlements')
            .update({
              status: 'failed',
              refused: true,
            })
            .eq('id', settlementId)
        }
      }
    } catch (e) {
      console.error('Error updating broker settlement:', e)
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
    <p>${isSuccess ? 'تم تسجيل الدفعة للوسيط' : 'حدث خطأ أثناء معالجة الدفع'}</p>
    ${isSuccess && cardLastFour ? `
    <div class="card-info">
      <span>بطاقة: ****${cardLastFour}</span>
      ${parseInt(npay) > 1 ? `<span>عدد التقسيطات: ${npay}</span>` : ''}
    </div>
    ` : ''}
    <p class="closing">سيتم إغلاق هذه النافذة تلقائياً...</p>
  </div>
  
  <script>
    function sendMessage() {
      try {
        var msg = {
          type: 'BROKER_PAYMENT_RESULT',
          status: '${finalStatus}',
          settlement_id: '${settlementId}',
          card_last_four: '${cardLastFour}',
          installments: ${npay || 1}
        };
        
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, '*');
        }
        if (window.top && window.top !== window) {
          window.top.postMessage(msg, '*');
        }
      } catch(e) {
        console.log('Could not post message:', e);
      }
    }
    
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
