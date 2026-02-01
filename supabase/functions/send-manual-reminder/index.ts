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

const POLICY_TYPE_LABELS: Record<string, string> = {
  'THIRD_FULL': 'ثالث/شامل',
  'THIRD_ONLY': 'طرف ثالث',
  'ROAD_SERVICE': 'سرفيس',
  'ACCIDENT_FEE_EXEMPTION': 'إعفاء رسوم الحادث',
};

function getPolicyTypeLabel(parent: string | null, child: string | null): string {
  if (!parent) return '';
  const parentLabel = POLICY_TYPE_LABELS[parent] || parent;
  if (child && parent === 'THIRD_FULL') {
    const childLabel = child === 'FULL' ? 'شامل' : child === 'THIRD' ? 'ثالث' : child;
    return childLabel; // Just show child label for THIRD_FULL
  }
  return parentLabel;
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
      // Get all unpaid active policies for this client (excluding ELZAMI)
      const { data: policies, error: policiesError } = await supabase
        .from('policies')
        .select(`
          id,
          policy_number,
          insurance_price,
          policy_type_parent,
          policy_type_child,
          end_date,
          group_id,
          car:cars(car_number),
          policy_payments(amount, refused)
        `)
        .eq('client_id', client_id)
        .eq('cancelled', false)
        .is('deleted_at', null)
        .neq('policy_type_parent', 'ELZAMI');

      if (policiesError) {
        console.error('Error fetching policies:', policiesError);
        return new Response(
          JSON.stringify({ error: 'Unable to load policy data. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate remaining for each policy and filter unpaid ones
      interface PolicyWithDebt {
        policyType: string;
        carNumber: string;
        remaining: number;
        endDate: string;
        groupId: string | null;
      }

      const unpaidPolicies: PolicyWithDebt[] = [];
      let totalRemaining = 0;

      for (const policy of policies || []) {
        const totalPaid = (policy.policy_payments || [])
          .filter((p: any) => !p.refused)
          .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        const remaining = policy.insurance_price - totalPaid;

        if (remaining > 0) {
          const policyTypeLabel = getPolicyTypeLabel(
            policy.policy_type_parent, 
            policy.policy_type_child
          );
          const carNumber = (policy.car as any)?.car_number || '';
          
          unpaidPolicies.push({
            policyType: policyTypeLabel,
            carNumber,
            remaining,
            endDate: policy.end_date,
            groupId: policy.group_id,
          });
          totalRemaining += remaining;
        }
      }

      if (unpaidPolicies.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No unpaid policies found for this client' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Group policies by group_id to identify packages
      const groupedByPackage = new Map<string, PolicyWithDebt[]>();
      const standalones: PolicyWithDebt[] = [];

      for (const p of unpaidPolicies) {
        if (p.groupId) {
          const existing = groupedByPackage.get(p.groupId) || [];
          existing.push(p);
          groupedByPackage.set(p.groupId, existing);
        } else {
          standalones.push(p);
        }
      }

      // Build policy details string
      const policyLines: string[] = [];

      // Add packages
      for (const [, pkgPolicies] of groupedByPackage) {
        if (pkgPolicies.length > 1) {
          // It's a package
          const types = pkgPolicies.map(p => p.policyType).join(' + ');
          const carNum = pkgPolicies[0].carNumber;
          const pkgTotal = pkgPolicies.reduce((sum, p) => sum + p.remaining, 0);
          policyLines.push(`📦 باقة (${types}) - سيارة ${carNum}: ₪${pkgTotal.toFixed(0)}`);
        } else {
          // Single policy with group_id but no other in package
          const p = pkgPolicies[0];
          policyLines.push(`• ${p.policyType} - سيارة ${p.carNumber}: ₪${p.remaining.toFixed(0)}`);
        }
      }

      // Add standalone policies
      for (const p of standalones) {
        policyLines.push(`• ${p.policyType}${p.carNumber ? ` - سيارة ${p.carNumber}` : ''}: ₪${p.remaining.toFixed(0)}`);
      }

      // Build final message
      finalMessage = `مرحباً ${client.full_name}،

لديك مبالغ متبقية على وثائق التأمين التالية:

${policyLines.join('\n')}

━━━━━━━━━━━━
💰 المجموع المتبقي: ₪${totalRemaining.toFixed(0)}

يرجى التواصل معنا لتسوية المبلغ.`;
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

  } catch (error: unknown) {
    // Log full error details server-side for debugging
    console.error('Error in send-manual-reminder:', error);
    
    // Return generic error message to client - never expose internal details
    return new Response(
      JSON.stringify({ error: 'Unable to send reminder at this time. Please try again.' }),
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
