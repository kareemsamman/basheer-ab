import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Tranzila Invoices API base URL
const BILLING_API_URL = 'https://billing5.tranzila.com/api/documents_db'

interface CreateInvoiceRequest {
  payment_id: string;
}

/**
 * Generate HMAC-SHA256 hash for Tranzila API authentication
 */
async function generateHash(privateKey: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(privateKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
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
        JSON.stringify({ error: 'payment_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Get payment settings (Tranzila invoice keys)
    const { data: settings } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('provider', 'tranzila')
      .single();

    if (!settings?.invoice_enabled || !settings?.invoice_api_public_key || !settings?.invoice_api_private_key) {
      return new Response(
        JSON.stringify({ error: 'Invoice generation is not enabled or API keys are missing' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
          client:clients!inner(full_name, id_number, phone_number, email),
          car:cars(car_number)
        )
      `)
      .eq('id', payment_id)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', paymentError);
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if already has a Tranzila receipt
    if (payment.tranzila_receipt_url) {
      return new Response(
        JSON.stringify({
          receipt_url: payment.tranzila_receipt_url,
          message: 'Invoice already exists'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const policy = (payment as any).policy;
    const client = policy?.client;
    const car = policy?.car;

    // 3. Build invoice payload
    const POLICY_TYPE_LABELS: Record<string, string> = {
      ELZAMI: 'إلزامي',
      THIRD_FULL: 'شامل/ثالث',
      ROAD_SERVICE: 'خدمات الطريق',
      ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
    };

    const policyTypeLabel = POLICY_TYPE_LABELS[policy?.policy_type_parent] || policy?.policy_type_parent || 'تأمين';
    const itemDescription = `${policyTypeLabel} - ${car?.car_number || ''} - ${policy?.policy_number || ''}`;

    // Payment method mapping: 1=Cash, 2=Check, 3=Credit, 5=Transfer, 10=Other
    const PAYMENT_METHOD_MAP: Record<string, string> = {
      cash: '1',
      cheque: '2',
      visa: '3',
      transfer: '5',
    };

    const paymentMethod = PAYMENT_METHOD_MAP[payment.payment_type || 'visa'] || '3';

    const invoicePayload: Record<string, any> = {
      terminal_name: terminalName,
      document_type: 'RE', // קבלה (Receipt)
      customer_name: client?.full_name || '',
      vat_id: client?.id_number || '',
      client_phone_1: client?.phone_number || '',
      client_email_1: client?.email || '',
      currency_set: 'ILS',
      items: [
        {
          name: itemDescription,
          units: 1,
          price_inc_vat: Number(payment.amount),
          is_taxable: true,
        }
      ],
      payments: [
        {
          payment_method: paymentMethod,
          amount: Number(payment.amount),
          payment_date: payment.payment_date,
          ...(payment.payment_type === 'visa' ? {
            cc_last_4_digits: payment.card_last_four || '',
            cc_number_of_payments: String(payment.installments_count || 1),
          } : {}),
        }
      ],
    };

    const payloadString = JSON.stringify(invoicePayload);

    // 4. Generate auth hash
    const requestHash = await generateHash(privateKey, payloadString);

    // 5. Call Tranzila create_document API
    console.log('[tranzila-create-invoice] Creating invoice for payment:', payment_id);

    const response = await fetch(`${BILLING_API_URL}/create_document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-tranzila-api-app-key': publicKey,
        'X-tranzila-api-request-hash': requestHash,
      },
      body: payloadString,
    });

    const result = await response.json();

    console.log('[tranzila-create-invoice] Tranzila response:', JSON.stringify(result));

    if (result.status_code !== 0) {
      console.error('[tranzila-create-invoice] Tranzila error:', result.status_msg);
      return new Response(
        JSON.stringify({ error: result.status_msg || 'Failed to create invoice', status_code: result.status_code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Build receipt URL from retrieval_key
    const retrievalKey = result.retrieval_key;
    const documentId = result.document_id;
    const receiptUrl = `https://my.tranzila.com/api/get_financial_document/${retrievalKey}`;

    // 7. Store receipt URL on payment record
    await supabase
      .from('policy_payments')
      .update({ tranzila_receipt_url: receiptUrl })
      .eq('id', payment_id);

    console.log('[tranzila-create-invoice] Invoice created successfully. Document ID:', documentId);

    return new Response(
      JSON.stringify({
        success: true,
        receipt_url: receiptUrl,
        document_id: documentId,
        retrieval_key: retrievalKey,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[tranzila-create-invoice] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
