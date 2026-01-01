import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendRemindersRequest {
  month?: string;
  days_remaining?: number;
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

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
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

    const { month, days_remaining = 30 }: SendRemindersRequest = await req.json();

    console.log(`[send-renewal-reminders] Starting bulk SMS send, days_remaining: ${days_remaining}`);

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

    // Get policies that need reminders
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + days_remaining);

    const cooldownDate = new Date(today);
    cooldownDate.setDate(today.getDate() - cooldownDays);

    const { data: policies, error: policiesError } = await supabase
      .from('policies')
      .select(`
        id,
        end_date,
        policy_type_parent,
        client_id,
        car_id,
        company_id
      `)
      .is('deleted_at', null)
      .is('cancelled', false)
      .is('transferred', false)
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', targetDate.toISOString().split('T')[0]);

    // Fetch related data separately
    const clientIds = [...new Set((policies || []).map(p => p.client_id).filter(Boolean))];
    const carIds = [...new Set((policies || []).map(p => p.car_id).filter(Boolean))];
    const companyIds = [...new Set((policies || []).map(p => p.company_id).filter(Boolean))];

    const [clientsRes, carsRes, companiesRes] = await Promise.all([
      clientIds.length > 0 ? supabase.from('clients').select('id, full_name, phone_number').in('id', clientIds) : { data: [] },
      carIds.length > 0 ? supabase.from('cars').select('id, car_number').in('id', carIds) : { data: [] },
      companyIds.length > 0 ? supabase.from('insurance_companies').select('id, name, name_ar').in('id', companyIds) : { data: [] }
    ]);

    const clientsMap = new Map((clientsRes.data || []).map((c: any) => [c.id, c]));
    const carsMap = new Map((carsRes.data || []).map((c: any) => [c.id, c]));
    const companiesMap = new Map((companiesRes.data || []).map((c: any) => [c.id, c]));

    if (policiesError) {
      console.error('[send-renewal-reminders] Error fetching policies:', policiesError);
      throw policiesError;
    }

    console.log(`[send-renewal-reminders] Found ${policies?.length || 0} policies expiring within ${days_remaining} days`);

    // Get existing tracking records to check cooldown
    const policyIds = policies?.map(p => p.id) || [];
    const { data: existingTracking } = await supabase
      .from('policy_renewal_tracking')
      .select('policy_id, reminder_sent_at')
      .in('policy_id', policyIds);

    const trackingMap = new Map(existingTracking?.map(t => [t.policy_id, t.reminder_sent_at]) || []);

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const policy of policies || []) {
      try {
        const client = clientsMap.get(policy.client_id);
        const car = carsMap.get(policy.car_id);
        const company = companiesMap.get(policy.company_id);

        // Check cooldown
        const lastSent = trackingMap.get(policy.id);
        if (lastSent && new Date(lastSent) > cooldownDate) {
          skippedCount++;
          continue;
        }

        if (!client?.phone_number) {
          skippedCount++;
          continue;
        }

        const endDate = new Date(policy.end_date).toLocaleDateString('en-GB');
        const message = template
          .replace('{client_name}', client.full_name || 'العميل')
          .replace('{car_number}', car?.car_number || '')
          .replace('{policy_end_date}', endDate)
          .replace('{policy_type}', policy.policy_type_parent)
          .replace('{company}', company?.name_ar || company?.name || '');

        let phone = client.phone_number.replace(/[\s\-\(\)]/g, '');
        if (phone.startsWith('0')) {
          phone = '972' + phone.slice(1);
        } else if (!phone.startsWith('972') && !phone.startsWith('+972')) {
          phone = '972' + phone;
        }
        phone = phone.replace('+', '');

        const smsPayload = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user>${smsSettings.sms_user}</user>
  <password>${smsSettings.sms_token}</password>
  <source>${smsSettings.sms_source}</source>
  <destinations>
    <phone>${phone}</phone>
  </destinations>
  <message>${message}</message>
</sms>`;

        const smsResponse = await fetch('https://019sms.co.il/api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml',
            'Authorization': `Bearer ${smsSettings.sms_token}`
          },
          body: smsPayload
        });

        const responseText = await smsResponse.text();
        const statusMatch = responseText.match(/<status>(\d+)<\/status>/);
        const status = statusMatch ? parseInt(statusMatch[1]) : -1;

        await supabase.from('sms_logs').insert({
          policy_id: policy.id,
          client_id: client.id,
          phone_number: phone,
          message: message,
          sms_type: 'renewal_reminder',
          status: status === 0 ? 'sent' : 'failed',
          error_message: status !== 0 ? `Status: ${status}` : null,
          sent_at: new Date().toISOString()
        });

        if (status === 0) {
          sentCount++;
          await supabase.from('policy_renewal_tracking').upsert({
            policy_id: policy.id,
            renewal_status: 'sms_sent',
            reminder_sent_at: new Date().toISOString()
          }, { onConflict: 'policy_id' });
        } else {
          errors.push(`Policy ${policy.id}: SMS failed`);
        }
      } catch (err: any) {
        errors.push(`Policy ${policy.id}: ${err.message}`);
      }
    }

    console.log(`[send-renewal-reminders] Complete. Sent: ${sentCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent_count: sentCount,
        skipped_count: skippedCount,
        error_count: errors.length,
        errors: errors.slice(0, 10) // Return first 10 errors
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
