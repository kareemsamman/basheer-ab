import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BILLING_API_URL = 'https://billing5.tranzila.com/api/documents_db'

interface CreateInvoiceRequest {
  payment_id: string;
}

async function generateHash(privateKey: string, publicKey: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataToSign = privateKey + publicKey + payload;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(privateKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'شامل/ثالث',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: '1',
  cheque: '2',
  visa: '3',
  transfer: '5',
};

async function callTranzilaApi(
  publicKey: string,
  privateKey: string,
  invoicePayload: Record<string, any>,
): Promise<{ success: boolean; data?: any; error?: string; provider_raw?: string }> {
  const payloadString = JSON.stringify(invoicePayload);
  // Tranzila requires a Unix timestamp for request freshness validation
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Hash is computed over payload + timestamp
  const requestHash = await generateHash(privateKey, payloadString + timestamp);

  const response = await fetch(`${BILLING_API_URL}/create_document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-tranzila-api-app-key': publicKey,
      'X-tranzila-api-request-hash': requestHash,
      'X-tranzila-api-request-ts': timestamp,
    },
    body: payloadString,
  });

  const responseText = await response.text();
  console.log('[tranzila-create-invoice] Raw response:', responseText.substring(0, 500));

  // Try to parse as JSON
  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch {
    // Plain text response from Tranzila (e.g. "request too old")
    return {
      success: false,
      error: `Tranzila returned: ${responseText}`,
      provider_raw: responseText,
    };
  }

  if (result.status_code !== 0) {
    return {
      success: false,
      error: result.status_msg || `Tranzila error code: ${result.status_code}`,
      provider_raw: responseText,
    };
  }

  return { success: true, data: result };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { payment_id } = await req.json() as CreateInvoiceRequest;

    if (!payment_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'payment_id is required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Get payment settings
    const { data: settings } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('provider', 'tranzila')
      .single();

    if (!settings?.invoice_enabled || !settings?.invoice_api_public_key || !settings?.invoice_api_private_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invoice generation is not enabled or API keys are missing' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const terminalName = settings.terminal_name;
    const publicKey = settings.invoice_api_public_key;
    const privateKey = settings.invoice_api_private_key;

    // 2. Get payment with related data
    const { data: payment, error: paymentError } = await supabase
      .from('policy_payments')
      .select(`
        id, amount, payment_date, payment_type, card_last_four, installments_count,
        tranzila_approval_code, tranzila_transaction_id, tranzila_receipt_url,
        policy:policies!inner(
          id, policy_number, policy_type_parent, policy_type_child, insurance_price,
          client:clients!inner(full_name, id_number, phone_number),
          car:cars(car_number)
        )
      `)
      .eq('id', payment_id)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', paymentError);
      return new Response(
        JSON.stringify({ success: false, error: 'Payment not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if already has a Tranzila receipt
    if (payment.tranzila_receipt_url) {
      return new Response(
        JSON.stringify({ success: true, receipt_url: payment.tranzila_receipt_url, message: 'Invoice already exists' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const policy = (payment as any).policy;
    const client = policy?.client;
    const car = policy?.car;

    const policyTypeLabel = POLICY_TYPE_LABELS[policy?.policy_type_parent] || policy?.policy_type_parent || 'تأمين';
    const itemDescription = `${policyTypeLabel} - ${car?.car_number || ''} - ${policy?.policy_number || ''}`;
    const paymentMethod = PAYMENT_METHOD_MAP[payment.payment_type || 'visa'] || '3';

    const invoicePayload: Record<string, any> = {
      terminal_name: terminalName,
      document_type: 'RE',
      customer_name: client?.full_name || '',
      vat_id: client?.id_number || '',
      client_phone_1: client?.phone_number || '',
      client_email_1: '',
      currency_set: 'ILS',
      items: [{
        name: itemDescription,
        units: 1,
        price_inc_vat: Number(payment.amount),
        is_taxable: true,
      }],
      payments: [{
        payment_method: paymentMethod,
        amount: Number(payment.amount),
        payment_date: payment.payment_date,
        ...(payment.payment_type === 'visa' ? {
          cc_last_4_digits: payment.card_last_four || '',
          cc_number_of_payments: String(payment.installments_count || 1),
        } : {}),
      }],
    };

    // 3. Call Tranzila with retry on "request too old"
    console.log('[tranzila-create-invoice] Creating invoice for payment:', payment_id);

    let apiResult = await callTranzilaApi(publicKey, privateKey, invoicePayload);

    // Retry once if provider says request is stale
    if (!apiResult.success && apiResult.provider_raw?.toLowerCase().includes('request too old')) {
      console.log('[tranzila-create-invoice] Retrying after "request too old"...');
      await new Promise(r => setTimeout(r, 500));
      apiResult = await callTranzilaApi(publicKey, privateKey, invoicePayload);
    }

    if (!apiResult.success) {
      console.error('[tranzila-create-invoice] Failed:', apiResult.error);
      return new Response(
        JSON.stringify({ success: false, error: apiResult.error, provider_raw: apiResult.provider_raw }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = apiResult.data;
    const retrievalKey = result.retrieval_key;
    const documentId = result.document_id;
    const receiptUrl = `https://my.tranzila.com/api/get_financial_document/${retrievalKey}`;

    // 4. Store receipt URL
    await supabase
      .from('policy_payments')
      .update({ tranzila_receipt_url: receiptUrl })
      .eq('id', payment_id);

    console.log('[tranzila-create-invoice] Invoice created. Document ID:', documentId);

    return new Response(
      JSON.stringify({ success: true, receipt_url: receiptUrl, document_id: documentId, retrieval_key: retrievalKey }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[tranzila-create-invoice] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
