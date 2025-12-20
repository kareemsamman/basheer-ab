import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmsRequest {
  phone: string;
  message: string;
}

interface SmsSettings {
  sms_user: string;
  sms_token: string;
  sms_source: string;
  is_enabled: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated and active
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is active
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (!profile || profile.status !== "active") {
      return new Response(
        JSON.stringify({ error: "User not authorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { phone, message }: SmsRequest = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "Phone and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get SMS settings
    const { data: smsSettings, error: settingsError } = await supabase
      .from("sms_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error("Error fetching SMS settings:", settingsError);
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

    const { sms_user, sms_token, sms_source } = smsSettings as SmsSettings;

    if (!sms_user || !sms_token || !sms_source) {
      return new Response(
        JSON.stringify({ error: "SMS settings are incomplete" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone number (remove leading 0 if Israeli number)
    let cleanPhone = phone.replace(/[^0-9+]/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "972" + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith("+")) {
      cleanPhone = cleanPhone.substring(1);
    }

    // Build 019sms API request
    // API documentation: https://www.019sms.co.il/developer/
    const smsApiUrl = "https://019sms.co.il/api";
    const smsParams = new URLSearchParams({
      user: sms_user,
      password: sms_token,
      from: sms_source,
      recipient: cleanPhone,
      message: message,
    });

    console.log(`Sending SMS to ${cleanPhone} from ${sms_source}`);

    const smsResponse = await fetch(`${smsApiUrl}?${smsParams.toString()}`, {
      method: "GET",
    });

    const smsResult = await smsResponse.text();
    console.log("019sms API response:", smsResult);

    // Parse 019sms response (usually returns status code like "1" for success)
    // The API returns different codes:
    // 1 = Success
    // 2 = Bad username/password
    // 3 = Bad "from" parameter
    // etc.
    const responseCode = parseInt(smsResult.trim(), 10);

    if (responseCode === 1) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "SMS sent successfully",
          phone: cleanPhone 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errorMessages: Record<number, string> = {
        2: "Invalid username or password",
        3: "Invalid sender name",
        4: "Invalid recipient number",
        5: "Message is empty",
        6: "Message too long",
        7: "Insufficient credits",
        8: "Scheduled time is in the past",
        9: "Invalid sender (blacklisted)",
        10: "Recipient blocked",
      };

      return new Response(
        JSON.stringify({ 
          error: errorMessages[responseCode] || `SMS API error: ${smsResult}`,
          code: responseCode
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    console.error("Error in send-sms function:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
