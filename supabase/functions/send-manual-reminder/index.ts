import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManualReminderRequest {
  client_id: string;
  policy_id?: string;
  message?: string;
  sms_type?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is active
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, branch_id')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'User not authorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { client_id, policy_id, message, sms_type }: ManualReminderRequest = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, full_name, phone_number, branch_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientPhone = client.phone_number;
    if (!clientPhone) {
      return new Response(
        JSON.stringify({ error: 'Client has no phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get SMS settings
    const { data: smsSettings, error: settingsError } = await supabase
      .from('sms_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError || !smsSettings?.is_enabled) {
      return new Response(
        JSON.stringify({ error: 'SMS service not enabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build message
    let finalMessage = message || '';
    
    if (!finalMessage) {
      // Get policy info if policy_id provided
      let policyNumber = '';
      let remaining = 0;

      if (policy_id) {
        const { data: policy } = await supabase
          .from('policies')
          .select(`
            policy_number,
            insurance_price,
            policy_payments(amount, refused)
          `)
          .eq('id', policy_id)
          .single();

        if (policy) {
          policyNumber = policy.policy_number || policy_id.substring(0, 8);
          const totalPaid = (policy.policy_payments || [])
            .filter((p: any) => !p.refused)
            .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
          remaining = policy.insurance_price - totalPaid;
        }
      }

      // Use payment request template
      const template = smsSettings.payment_request_template || 
        'مرحباً {{client_name}}، لديك مبلغ متبقي {{remaining_amount}} شيكل. يرجى التواصل معنا.';
      
      finalMessage = template
        .replace(/\{\{client_name\}\}/g, client.full_name || 'عميل')
        .replace(/\{\{policy_number\}\}/g, policyNumber)
        .replace(/\{\{remaining_amount\}\}/g, remaining > 0 ? remaining.toFixed(0) : '0');
    }

    // Send SMS
    const smsResult = await sendSms(smsSettings, clientPhone, finalMessage);

    // Log the SMS
    const { error: logError } = await supabase
      .from('sms_logs')
      .insert({
        branch_id: client.branch_id,
        client_id: client.id,
        policy_id: policy_id || null,
        phone_number: clientPhone,
        message: finalMessage,
        sms_type: sms_type || 'payment_request',
        status: smsResult.success ? 'sent' : 'failed',
        error_message: smsResult.error || null,
        sent_at: smsResult.success ? new Date().toISOString() : null,
        created_by: user.id,
      });

    if (logError) {
      console.error('Error logging SMS:', logError);
    }

    if (!smsResult.success) {
      return new Response(
        JSON.stringify({ error: smsResult.error || 'Failed to send SMS' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'SMS sent successfully',
        phone: clientPhone,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in send-manual-reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendSms(
  settings: any,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const { sms_user, sms_token, sms_source } = settings;

  if (!sms_user || !sms_token || !sms_source) {
    return { success: false, error: 'SMS settings incomplete' };
  }

  const escapeXml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('972')) {
    cleanPhone = '0' + cleanPhone.substring(3);
  }

  const dlr = crypto.randomUUID();
  const smsXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sms>` +
    `<user><username>${escapeXml(sms_user)}</username></user>` +
    `<source>${escapeXml(sms_source)}</source>` +
    `<destinations><phone id="${dlr}">${escapeXml(cleanPhone)}</phone></destinations>` +
    `<message>${escapeXml(message)}</message>` +
    `</sms>`;

  console.log(`Sending SMS to ${cleanPhone}`);

  const smsResponse = await fetch('https://019sms.co.il/api', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sms_token}`,
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: smsXml,
  });

  const smsResult = await smsResponse.text();

  const extractTag = (xml: string, tag: string) => {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
    return match?.[1]?.trim() ?? null;
  };

  const status = extractTag(smsResult, 'status');
  const apiMessage = extractTag(smsResult, 'message');

  if (!smsResponse.ok || status !== '0') {
    return { success: false, error: apiMessage || `SMS API error (status=${status})` };
  }

  return { success: true };
}
