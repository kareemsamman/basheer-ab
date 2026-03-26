import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 200;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const extractXmlTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match?.[1]?.trim() ?? null;
};

interface SendRemindersRequest {
  month?: string;
  days_remaining?: number;
  // Batch continuation fields
  continuation_policy_ids?: string[];
  running_sent_count?: number;
  running_skipped_count?: number;
  running_error_count?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SendRemindersRequest = await req.json();
    const {
      month,
      days_remaining = 30,
      continuation_policy_ids,
      running_sent_count = 0,
      running_skipped_count = 0,
      running_error_count = 0,
    } = body;

    const isContinuation = Array.isArray(continuation_policy_ids) && continuation_policy_ids.length > 0;

    console.log(`[send-renewal-reminders] ${isContinuation ? 'Continuation' : 'Initial'} call. days_remaining: ${days_remaining}, continuation IDs: ${continuation_policy_ids?.length || 0}`);

    // Get SMS settings
    const { data: smsSettings, error: smsError } = await supabase
      .from('sms_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (smsError || !smsSettings || !smsSettings.is_enabled) {
      return new Response(
        JSON.stringify({ error: "خدمة الرسائل غير مفعلة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const template = smsSettings.renewal_reminder_template || 
      'مرحباً {client_name}، نذكرك بأن تأمين سيارتك رقم {car_number} سينتهي بتاريخ {policy_end_date}. للتجديد تواصل معنا.';
    const cooldownDays = smsSettings.renewal_reminder_cooldown_days || 7;

    const today = new Date();
    const cooldownDate = new Date(today);
    cooldownDate.setDate(today.getDate() - cooldownDays);

    let policyIdsToProcess: string[];

    if (isContinuation) {
      // Continuation: use provided IDs directly
      policyIdsToProcess = continuation_policy_ids!;
    } else {
      // Initial call: fetch all matching policies and filter by cooldown
      let startDate: string;
      let endDate: string;

      if (month) {
        // Use the selected month range (e.g. "2026-03" → 2026-03-01 to 2026-03-31)
        const [y, m] = month.split('-').map(Number);
        startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else {
        startDate = today.toISOString().split('T')[0];
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + days_remaining);
        endDate = targetDate.toISOString().split('T')[0];
      }

      const { data: policies, error: policiesError } = await supabase
        .from('policies')
        .select('id, end_date, client_id')
        .is('deleted_at', null)
        .or('cancelled.is.null,cancelled.eq.false')
        .or('transferred.is.null,transferred.eq.false')
        .gte('end_date', startDate)
        .lte('end_date', endDate);

      if (policiesError) {
        console.error('[send-renewal-reminders] Error fetching policies:', policiesError);
        throw policiesError;
      }

      console.log(`[send-renewal-reminders] Found ${policies?.length || 0} policies expiring within ${days_remaining} days`);

      // Check cooldown for all policies
      const allPolicyIds = policies?.map(p => p.id) || [];
      const { data: existingTracking } = await supabase
        .from('policy_renewal_tracking')
        .select('policy_id, reminder_sent_at')
        .in('policy_id', allPolicyIds);

      const trackingMap = new Map(existingTracking?.map(t => [t.policy_id, t.reminder_sent_at]) || []);

      // Filter: only policies that pass cooldown and have a client
      const filteredIds: string[] = [];
      let initialSkipped = 0;

      for (const policy of policies || []) {
        const lastSent = trackingMap.get(policy.id);
        if (lastSent && new Date(lastSent) > cooldownDate) {
          initialSkipped++;
          continue;
        }
        if (!policy.client_id) {
          initialSkipped++;
          continue;
        }
        filteredIds.push(policy.id);
      }

      policyIdsToProcess = filteredIds;
      // Add initial skipped to running count
      if (initialSkipped > 0) {
        console.log(`[send-renewal-reminders] Skipped ${initialSkipped} policies (cooldown/no client)`);
      }
    }

    // Split into current batch and remaining
    const currentBatch = policyIdsToProcess.slice(0, BATCH_SIZE);
    const remainingIds = policyIdsToProcess.slice(BATCH_SIZE);

    console.log(`[send-renewal-reminders] Processing batch of ${currentBatch.length}, remaining: ${remainingIds.length}`);

    if (currentBatch.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          sent_count: running_sent_count,
          skipped_count: running_skipped_count,
          error_count: running_error_count,
          remaining: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch policy details for current batch
    const { data: batchPolicies } = await supabase
      .from('policies')
      .select('id, end_date, policy_type_parent, client_id, car_id, company_id')
      .in('id', currentBatch);

    // Group policies by client_id so we send ONE SMS per client
    const clientPoliciesMap = new Map<string, typeof batchPolicies>();
    for (const policy of batchPolicies || []) {
      if (!policy.client_id) continue;
      const existing = clientPoliciesMap.get(policy.client_id) || [];
      existing.push(policy);
      clientPoliciesMap.set(policy.client_id, existing);
    }

    const clientIds = [...clientPoliciesMap.keys()];
    const carIds = [...new Set((batchPolicies || []).map(p => p.car_id).filter(Boolean))];
    const companyIds = [...new Set((batchPolicies || []).map(p => p.company_id).filter(Boolean))];

    const [clientsRes, carsRes, companiesRes] = await Promise.all([
      clientIds.length > 0 ? supabase.from('clients').select('id, full_name, phone_number').in('id', clientIds) : { data: [] },
      carIds.length > 0 ? supabase.from('cars').select('id, car_number').in('id', carIds) : { data: [] },
      companyIds.length > 0 ? supabase.from('insurance_companies').select('id, name, name_ar').in('id', companyIds) : { data: [] },
    ]);

    const clientsMap = new Map((clientsRes.data || []).map((c: any) => [c.id, c]));
    const carsMap = new Map((carsRes.data || []).map((c: any) => [c.id, c]));
    const companiesMap = new Map((companiesRes.data || []).map((c: any) => [c.id, c]));

    let batchSent = 0;
    let batchSkipped = 0;
    let batchErrors = 0;

    for (const [clientId, clientPolicies] of clientPoliciesMap) {
      try {
        const client = clientsMap.get(clientId);

        if (!client?.phone_number || !clientPolicies) {
          batchSkipped += (clientPolicies?.length ?? 0);
          continue;
        }

        // Build a single message summarizing all policies for this client
        const earliestEnd = clientPolicies
          .map(p => p.end_date)
          .sort()[0];
        const endDate = new Date(earliestEnd).toLocaleDateString('en-GB');
        const carNumbers = [...new Set(clientPolicies.map(p => carsMap.get(p.car_id)?.car_number).filter(Boolean))];
        const carNumbersStr = carNumbers.join(', ') || '';

        const message = template
          .replace('{client_name}', client.full_name || 'العميل')
          .replace('{car_number}', carNumbersStr)
          .replace('{policy_end_date}', endDate)
          .replace('{policy_type}', clientPolicies.map(p => p.policy_type_parent).join(', '))
          .replace('{company}', [...new Set(clientPolicies.map(p => {
            const co = companiesMap.get(p.company_id);
            return co?.name_ar || co?.name || '';
          }).filter(Boolean))].join(', '));

        let phone = client.phone_number.replace(/[^0-9]/g, '');
        if (phone.startsWith('972')) {
          phone = '0' + phone.substring(3);
        }
        if (!phone.startsWith('0') && phone.length >= 9) {
          phone = '0' + phone;
        }

        const smsPayload = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user><username>${escapeXml(smsSettings.sms_user || '')}</username></user>
  <source>${escapeXml(smsSettings.sms_source || '')}</source>
  <destinations>
    <phone id="${crypto.randomUUID()}">${escapeXml(phone)}</phone>
  </destinations>
  <message>${escapeXml(message)}</message>
</sms>`;

        const smsResponse = await fetch('https://019sms.co.il/api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Authorization': `Bearer ${smsSettings.sms_token}`
          },
          body: smsPayload
        });

        const responseText = await smsResponse.text();
        const status = parseInt(extractXmlTag(responseText, 'status') || '-1', 10);
        const providerMessage = extractXmlTag(responseText, 'message');

        // Log SMS once per client (use first policy_id as reference)
        await supabase.from('sms_logs').insert({
          policy_id: clientPolicies[0].id,
          client_id: clientId,
          phone_number: phone,
          message: message,
          sms_type: 'renewal_reminder',
          status: status === 0 ? 'sent' : 'failed',
          error_message: status !== 0 ? `Status: ${status}${providerMessage ? ` - ${providerMessage}` : ''}` : null,
          sent_at: new Date().toISOString()
        });

        if (status === 0) {
          batchSent++;
          // Mark ALL policies for this client as sms_sent
          for (const p of clientPolicies) {
            await supabase.from('policy_renewal_tracking').upsert({
              policy_id: p.id,
              renewal_status: 'sms_sent',
              reminder_sent_at: new Date().toISOString()
            }, { onConflict: 'policy_id' });
          }
        } else {
          console.error(`[send-renewal-reminders] SMS provider rejected client ${clientId}: status=${status}, message=${providerMessage || 'N/A'}`);
          batchErrors++;
        }
      } catch (err: any) {
        console.error(`[send-renewal-reminders] Error for client ${clientId}:`, err.message);
        batchErrors++;
      }
    }

    const totalSent = running_sent_count + batchSent;
    const totalSkipped = running_skipped_count + batchSkipped;
    const totalErrors = running_error_count + batchErrors;

    console.log(`[send-renewal-reminders] Batch done. Sent: ${batchSent}, Skipped: ${batchSkipped}, Errors: ${batchErrors}. Totals so far: ${totalSent}/${totalSkipped}/${totalErrors}. Remaining: ${remainingIds.length}`);

    // If more remain, trigger next batch
    if (remainingIds.length > 0) {
      const selfUrl = `${supabaseUrl}/functions/v1/send-renewal-reminders`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          month,
          days_remaining,
          continuation_policy_ids: remainingIds,
          running_sent_count: totalSent,
          running_skipped_count: totalSkipped,
          running_error_count: totalErrors,
        }),
      }).catch(err => console.error('[send-renewal-reminders] Error triggering next batch:', err));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent_count: totalSent,
        skipped_count: totalSkipped,
        error_count: totalErrors,
        remaining: remainingIds.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[send-renewal-reminders] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
