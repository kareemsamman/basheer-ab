import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InitPaymentRequest {
  policy_id: string
  amount: number
  payment_date: string
  notes?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get authorization header for user context
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user from JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: InitPaymentRequest = await req.json()
    const { policy_id, amount, payment_date, notes } = body

    if (!policy_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch Tranzila settings
    const { data: settings, error: settingsError } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('provider', 'tranzila')
      .single()

    if (settingsError || !settings) {
      console.error('Settings error:', settingsError)
      return new Response(JSON.stringify({ error: 'Payment settings not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!settings.is_enabled) {
      return new Response(JSON.stringify({ error: 'Tranzila payments are disabled' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate unique index for this transaction
    const tranzilaIndex = `${policy_id}-${Date.now()}`

    // Create pending payment record
    const { data: payment, error: paymentError } = await supabase
      .from('policy_payments')
      .insert({
        policy_id,
        amount,
        payment_type: 'visa',
        payment_date,
        notes: notes || null,
        provider: 'tranzila',
        tranzila_index: tranzilaIndex,
        created_by_admin_id: user.id,
        refused: null, // null = pending, false = paid, true = refused
      })
      .select()
      .single()

    if (paymentError) {
      console.error('Payment creation error:', paymentError)
      return new Response(JSON.stringify({ error: 'Failed to create payment record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // If test mode, return simulated success
    if (settings.test_mode) {
      // Update payment to success immediately in test mode
      await supabase
        .from('policy_payments')
        .update({
          refused: false,
          tranzila_transaction_id: 'TEST-' + Date.now(),
          tranzila_approval_code: 'TEST-APPROVED',
          tranzila_response_code: '000',
        })
        .eq('id', payment.id)

      return new Response(JSON.stringify({
        success: true,
        test_mode: true,
        payment_id: payment.id,
        message: 'Payment simulated successfully (test mode)',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build Tranzila form data for POST method (official recommended approach)
    const terminalName = settings.terminal_name
    if (!terminalName) {
      return new Response(JSON.stringify({ error: 'Terminal name not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const iframeUrl = `https://direct.tranzila.com/${terminalName}/iframenew.php`
    
    // Build form fields for POST submission (per Tranzila docs)
    // See: https://docs.tranzila.com/docs/payments-billing/795m2yi7q4nmq-iframe-integration
    const formFields: Record<string, string> = {
      sum: amount.toString(),
      currency: '1', // 1 = NIS
      cred_type: '1', // 1 = regular credit card
      tranmode: 'A', // A = standard transaction
      myid: tranzilaIndex, // Our reference ID for matching webhook
      lang: 'il', // Hebrew language display
      nologo: '1', // Hide Tranzila logo for cleaner look
      buttonLabel: 'שלם עכשיו', // Hebrew pay button text
    }

    // Add callback URLs - these should be absolute URLs to our payment result pages
    if (settings.success_url) {
      formFields.success_url_address = `${settings.success_url}?payment_id=${payment.id}`
    }
    if (settings.fail_url) {
      formFields.fail_url_address = `${settings.fail_url}?payment_id=${payment.id}`
    }
    if (settings.notify_url) {
      formFields.notify_url_address = settings.notify_url
    }

    console.log('Generated Tranzila form fields:', JSON.stringify(formFields))

    return new Response(JSON.stringify({
      success: true,
      test_mode: false,
      payment_id: payment.id,
      iframe_url: iframeUrl,
      form_fields: formFields, // Return fields for POST submission
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in tranzila-init:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
