import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendInvoiceSmsRequest {
  policy_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

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

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { policy_id }: SendInvoiceSmsRequest = await req.json();

    if (!policy_id) {
      return new Response(
        JSON.stringify({ error: "policy_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-invoice-sms] Processing policy: ${policy_id}`);

    // Get policy with client details
    const { data: policy, error: policyError } = await supabase
      .from("policies")
      .select(`
        *,
        client:clients(full_name, phone_number)
      `)
      .eq("id", policy_id)
      .single();

    if (policyError || !policy) {
      console.error("[send-invoice-sms] Policy not found:", policyError);
      return new Response(
        JSON.stringify({ error: "Policy not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already sent
    if (policy.invoices_sent_at) {
      console.log("[send-invoice-sms] Invoices already sent at:", policy.invoices_sent_at);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Invoices already sent",
          sent_at: policy.invoices_sent_at
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get insurance files (uploaded policy documents from Bunny CDN)
    const { data: insuranceFiles, error: filesError } = await supabase
      .from("media_files")
      .select("id, cdn_url, original_name, mime_type")
      .eq("entity_id", policy_id)
      .in("entity_type", ["policy", "policy_insurance"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filesError) {
      console.error("[send-invoice-sms] Error fetching files:", filesError);
    }

    if (!insuranceFiles || insuranceFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one policy file must be uploaded before sending" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if client has phone number
    if (!policy.client?.phone_number) {
      return new Response(
        JSON.stringify({ error: "Client phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get SMS settings
    const { data: smsSettings, error: smsSettingsError } = await supabase
      .from("sms_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (smsSettingsError) {
      console.error("[send-invoice-sms] Error fetching SMS settings:", smsSettingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch SMS settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings || !smsSettings.is_enabled) {
      return new Response(
        JSON.stringify({ error: "SMS service is not enabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoices for this policy (AB invoice)
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, language, status, metadata_json, pdf_url")
      .eq("policy_id", policy_id)
      .in("status", ["generated", "regenerated"]);

    if (invoicesError) {
      console.error("[send-invoice-sms] Error fetching invoices:", invoicesError);
    }

    // Build policy file URLs (direct Bunny CDN links)
    const policyFileUrls = insuranceFiles.map(f => f.cdn_url);
    const firstPolicyUrl = policyFileUrls[0] || "";

    // AB Invoice URL - use pdf_url if exists, otherwise use generated HTML preview
    const origin = req.headers.get("Origin") || req.headers.get("Referer")?.replace(/\/$/, "") || "";
    let abInvoiceUrl = "";
    if (invoices && invoices.length > 0) {
      const inv = invoices[0];
      if (inv.pdf_url) {
        abInvoiceUrl = inv.pdf_url;
      } else {
        // Fallback to HTML preview
        abInvoiceUrl = `${origin}/invoice-preview/${inv.id}`;
      }
    }

    // Build SMS message using template
    let smsMessage = smsSettings.invoice_sms_template || 
      "مرحباً {{client_name}}، وثيقة التأمين جاهزة. البوليصة: {{policy_url}} فاتورة AB: {{ab_invoice_url}}";

    smsMessage = smsMessage
      .replace(/\{\{client_name\}\}/g, policy.client?.full_name || "عميل")
      .replace(/\{\{policy_number\}\}/g, policy.policy_number || "")
      .replace(/\{\{policy_url\}\}/g, firstPolicyUrl)
      .replace(/\{\{ab_invoice_url\}\}/g, abInvoiceUrl)
      .replace(/\{\{insurance_invoice_url\}\}/g, firstPolicyUrl); // Legacy placeholder

    const escapeXml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;");

    // Normalize phone for 019sms (expects 05xxxxxxx or 5xxxxxxx)
    let cleanPhone = policy.client.phone_number.replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("972")) {
      cleanPhone = "0" + cleanPhone.substring(3);
    }

    // Send SMS via 019sms (official XML API)
    const dlr = crypto.randomUUID();
    const smsXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<sms>` +
      `<user><username>${escapeXml(smsSettings.sms_user || "")}</username></user>` +
      `<source>${escapeXml(smsSettings.sms_source || "")}</source>` +
      `<destinations><phone id="${dlr}">${escapeXml(cleanPhone)}</phone></destinations>` +
      `<message>${escapeXml(smsMessage)}</message>` +
      `</sms>`;

    console.log(`[send-invoice-sms] Sending SMS to ${cleanPhone}`);
    console.log(`[send-invoice-sms] Policy URL: ${firstPolicyUrl}`);
    console.log(`[send-invoice-sms] AB Invoice URL: ${abInvoiceUrl}`);

    const smsResponse = await fetch("https://019sms.co.il/api", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${smsSettings.sms_token}`,
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: smsXml,
    });

    const smsResult = await smsResponse.text();
    console.log("[send-invoice-sms] 019sms raw response:", smsResult);

    const extractTag = (xml: string, tag: string) => {
      const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      return match?.[1]?.trim() ?? null;
    };

    const status = extractTag(smsResult, "status");
    const apiMessage = extractTag(smsResult, "message");

    if (!smsResponse.ok || status !== "0") {
      console.error(`[send-invoice-sms] SMS failed: status=${status} message=${apiMessage}`);
      return new Response(
        JSON.stringify({ error: apiMessage || `SMS API error (status=${status ?? "unknown"})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as sent
    const { error: updateError } = await supabase
      .from("policies")
      .update({ invoices_sent_at: new Date().toISOString() })
      .eq("id", policy_id);

    if (updateError) {
      console.error("[send-invoice-sms] Error updating policy:", updateError);
    }

    const duration = Date.now() - startTime;
    console.log(`[send-invoice-sms] Completed in ${duration}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Documents sent via SMS",
        sent_to: cleanPhone,
        policy_url: firstPolicyUrl,
        ab_invoice_url: abInvoiceUrl,
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[send-invoice-sms] Fatal error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
