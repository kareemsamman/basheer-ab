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
    const { filter_days, search, custom_message } = await req.json();

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
        const remainingAmount = Math.round(Number(client.total_remaining) || 0);

        // Use custom message or template
        let message = custom_message;
        if (!message) {
          message = smsSettings.payment_request_template || 
            `مرحباً ${clientName}، لديك مبلغ متبقي ${remainingAmount} شيكل. يرجى التواصل معنا لتسوية المبلغ.`;
          
          // Replace placeholders
          message = message
            .replace(/\{\{client_name\}\}/g, clientName)
            .replace(/\{client_name\}/g, clientName)
            .replace(/\{\{remaining_amount\}\}/g, remainingAmount.toString())
            .replace(/\{remaining_amount\}/g, remainingAmount.toString());
        }

        // Send SMS via 019sms - using correct POST XML format
        const smsUser = smsSettings.sms_user;
        const smsToken = smsSettings.sms_token;
        const smsSource = smsSettings.sms_source || "AB-Insurance";

        if (!smsUser || !smsToken) {
          console.log("SMS credentials not configured, skipping");
          failedCount++;
          continue;
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
