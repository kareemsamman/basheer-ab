import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to escape XML special characters
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Helper to extract XML tag content
const extractTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
};

// Policy type labels in Arabic
const POLICY_TYPE_LABELS: Record<string, string> = {
  'THIRD_FULL': 'ثالث/شامل',
  'ROAD_SERVICE': 'سرفيس',
  'ACCIDENT_FEE_EXEMPTION': 'إعفاء رسوم الحادث',
  'HEALTH': 'تأمين صحي',
  'LIFE': 'تأمين حياة',
  'PROPERTY': 'تأمين ممتلكات',
  'TRAVEL': 'تأمين سفر',
  'BUSINESS': 'تأمين أعمال',
  'OTHER': 'أخرى',
};

function getPolicyTypeLabel(parent: string | null, child: string | null): string {
  if (!parent) return '';
  if (child && parent === 'THIRD_FULL') {
    return child === 'FULL' ? 'شامل' : child === 'THIRD' ? 'ثالث' : child;
  }
  return POLICY_TYPE_LABELS[parent] || parent;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { filter_days, search } = await req.json();

    console.log(`Bulk SMS request - filter_days: ${filter_days}, search: ${search}`);

    // Get SMS settings
    const { data: smsSettings, error: settingsError } = await supabase
      .from("sms_settings")
      .select("*")
      .single();

    if (settingsError || !smsSettings) {
      console.error("SMS settings error:", settingsError);
      return new Response(
        JSON.stringify({ error: "SMS settings not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get all clients matching the filter (no pagination limit)
    const { data: clientRows, error: clientError } = await supabase.rpc(
      "report_client_debts",
      {
        p_search: search || null,
        p_filter_days: filter_days,
        p_limit: 10000, // Large limit to get all
        p_offset: 0,
      }
    );

    if (clientError) {
      console.error("Client fetch error:", clientError);
      throw clientError;
    }

    console.log(`Found ${clientRows?.length || 0} clients with debt`);

    // Filter clients with valid phone numbers
    const clientsWithPhone = (clientRows || []).filter(
      (c: any) => c.client_phone && c.client_phone.trim() !== ""
    );

    console.log(`${clientsWithPhone.length} clients have phone numbers`);

    // Get company footer info
    const companyLocation = smsSettings.company_location || '';
    const phoneLinks = (smsSettings.company_phone_links as any[]) || [];
    const phones = phoneLinks.map((p: any) => p.phone).filter(Boolean).join(' | ');

    const smsUser = smsSettings.sms_user;
    const smsToken = smsSettings.sms_token;
    const smsSource = smsSettings.sms_source || "AB-Insurance";

    if (!smsUser || !smsToken) {
      return new Response(
        JSON.stringify({ error: "SMS credentials not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let sentCount = 0;
    let failedCount = 0;

    // Send SMS to each client
    for (const client of clientsWithPhone) {
      try {
        // Clean phone number - normalize to 05xxxxxxx format
        let cleanPhone = client.client_phone.replace(/[^0-9]/g, "");
        if (cleanPhone.startsWith("972")) {
          cleanPhone = "0" + cleanPhone.substring(3);
        }
        
        const clientName = client.client_name || "عميل";
        
        // Fetch unpaid policies for this client
        const { data: policies, error: policiesError } = await supabase
          .from('policies')
          .select(`
            id,
            policy_type_parent,
            policy_type_child,
            insurance_price,
            car:cars(car_number),
            policy_payments(amount, refused)
          `)
          .eq('client_id', client.client_id)
          .neq('policy_type_parent', 'ELZAMI')
          .eq('cancelled', false)
          .is('deleted_at', null);

        if (policiesError) {
          console.error(`Error fetching policies for client ${client.client_id}:`, policiesError);
          failedCount++;
          continue;
        }

        // Calculate remaining for each policy
        const unpaidPolicies: { policyType: string; carNumber: string | null; remaining: number }[] = [];
        
        for (const policy of (policies || [])) {
          const price = Number(policy.insurance_price) || 0;
          const payments = (policy.policy_payments || []) as any[];
          const paidAmount = payments
            .filter((p: any) => !p.refused)
            .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
          
          const remaining = price - paidAmount;
          
          if (remaining > 0) {
            const policyType = getPolicyTypeLabel(policy.policy_type_parent, policy.policy_type_child);
            const carNumber = (policy.car as any)?.car_number || null;
            unpaidPolicies.push({ policyType, carNumber, remaining: Math.round(remaining) });
          }
        }

        // Skip if no unpaid policies
        if (unpaidPolicies.length === 0) {
          console.log(`Client ${client.client_id} has no unpaid policies, skipping`);
          continue;
        }

        // Calculate total remaining
        const totalRemaining = unpaidPolicies.reduce((sum, p) => sum + p.remaining, 0);

        // Build policy lines
        const policyLines = unpaidPolicies.map(p => 
          `• ${p.policyType}${p.carNumber ? ` - ${p.carNumber}` : ''}: ₪${p.remaining.toLocaleString()}`
        );

        // Build final message with footer
        let message = `مرحباً ${clientName}،

لديك مبالغ متبقية:
${policyLines.join('\n')}

━━━━━━━━━━━━
💰 المجموع: ₪${totalRemaining.toLocaleString()}

AB للتأمين`;

        // Add location if available
        if (companyLocation) {
          message += `\n📍 ${companyLocation}`;
        }

        // Add phones if available
        if (phones) {
          message += `\n📞 ${phones}`;
        }

        // Build 019sms XML request (official API format)
        const dlr = crypto.randomUUID();
        const smsXml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<sms>` +
          `<user><username>${escapeXml(smsUser)}</username></user>` +
          `<source>${escapeXml(smsSource)}</source>` +
          `<destinations><phone id="${dlr}">${escapeXml(cleanPhone)}</phone></destinations>` +
          `<message>${escapeXml(message)}</message>` +
          `</sms>`;

        console.log(`Sending SMS to ${cleanPhone} from ${smsSource}`);

        const smsResponse = await fetch("https://019sms.co.il/api", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${smsToken}`,
            "Content-Type": "application/xml; charset=utf-8",
          },
          body: smsXml,
        });

        const smsResult = await smsResponse.text();
        console.log(`019sms response for ${cleanPhone}:`, smsResult);

        const status = extractTag(smsResult, "status");
        const apiMessage = extractTag(smsResult, "message");
        const isSuccess = status === "0";

        // Log the SMS
        await supabase.from("sms_logs").insert({
          phone_number: cleanPhone,
          message: message,
          sms_type: "payment_request",
          client_id: client.client_id,
          status: isSuccess ? "sent" : "failed",
          error_message: isSuccess ? null : (apiMessage || smsResult.substring(0, 200)),
          sent_at: new Date().toISOString(),
          created_by: user.id,
        });

        if (isSuccess) {
          sentCount++;
        } else {
          failedCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`Error sending to ${client.client_phone}:`, err);
        failedCount++;
      }
    }

    console.log(`Bulk SMS complete: sent=${sentCount}, failed=${failedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        total_clients: clientsWithPhone.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Bulk SMS error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
