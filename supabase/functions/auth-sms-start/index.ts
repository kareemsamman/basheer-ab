import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmsStartRequest {
  phone: string;
}

// Generate a 6-digit OTP
function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, '0');
}

// Hash OTP for storage
async function hashOTP(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Normalize phone number
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('972')) {
    normalized = '0' + normalized.slice(3);
  }
  if (normalized.startsWith('+972')) {
    normalized = '0' + normalized.slice(4);
  }
  if (!normalized.startsWith('0') && normalized.length === 9) {
    normalized = '0' + normalized;
  }
  return normalized;
}

// XML escape helper
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Send SMS via 019
async function sendSmsOTP(
  smsUser: string,
  smsToken: string,
  smsSource: string,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user>
    <username>${escapeXml(smsUser)}</username>
  </user>
  <source>${escapeXml(smsSource)}</source>
  <destinations>
    <phone>${escapeXml(phone)}</phone>
  </destinations>
  <message>${escapeXml(message)}</message>
</sms>`;

    console.log("Sending SMS to:", phone);

    const response = await fetch("https://019sms.co.il/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Authorization": `Bearer ${smsToken}`,
      },
      body: xmlPayload,
    });

    const responseText = await response.text();
    console.log("019 SMS Response:", responseText);

    if (responseText.includes("<status>0</status>") || responseText.includes("OK")) {
      return { success: true };
    }

    const errorMatch = responseText.match(/<message>(.*?)<\/message>/);
    const errorMsg = errorMatch ? errorMatch[1] : "Unknown SMS error";
    
    return { success: false, error: errorMsg };
  } catch (error: unknown) {
    console.error("SMS sending error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { phone }: SmsStartRequest = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: "رقم الهاتف مطلوب" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    if (normalizedPhone.length < 9 || normalizedPhone.length > 15) {
      return new Response(
        JSON.stringify({ success: false, error: "رقم الهاتف غير صالح" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // IMPORTANT: Check if user exists and has access BEFORE sending OTP
    // Check by phone in profiles table
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, status, phone")
      .eq("phone", normalizedPhone)
      .single();

    if (profileError || !existingProfile) {
      console.log("No profile found for phone:", normalizedPhone);
      return new Response(
        JSON.stringify({ success: false, error: "رقم الهاتف هذا غير مسجل في النظام. تواصل مع المدير للحصول على صلاحية الدخول." }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (existingProfile.status === "blocked") {
      return new Response(
        JSON.stringify({ success: false, error: "تم حظر هذا الحساب. تواصل مع المدير." }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check rate limiting - max 3 OTPs per phone per 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentOtps } = await supabase
      .from("otp_codes")
      .select("id")
      .eq("identifier", normalizedPhone)
      .eq("channel", "sms")
      .gte("created_at", tenMinutesAgo);

    if (recentOtps && recentOtps.length >= 3) {
      return new Response(
        JSON.stringify({ success: false, error: "تم تجاوز الحد الأقصى للمحاولات. حاول لاحقاً." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get auth settings
    const { data: authSettings, error: settingsError } = await supabase
      .from("auth_settings")
      .select("*")
      .limit(1)
      .single();

    if (settingsError || !authSettings) {
      console.error("Auth settings error:", settingsError);
      return new Response(
        JSON.stringify({ success: false, error: "خطأ في إعدادات المصادقة" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!authSettings.sms_otp_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "تسجيل الدخول بالرسائل النصية غير مفعل" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!authSettings.sms_019_user || !authSettings.sms_019_token || !authSettings.sms_019_source) {
      return new Response(
        JSON.stringify({ success: false, error: "إعدادات الرسائل النصية غير مكتملة" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store OTP
    const { error: insertError } = await supabase
      .from("otp_codes")
      .insert({
        identifier: normalizedPhone,
        channel: "sms",
        otp_hash: otpHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("OTP insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "فشل في إنشاء رمز التحقق" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Prepare SMS content
    const message = (authSettings.sms_message_template || "رمز التحقق الخاص بك هو: {code}")
      .replace(/{code}/g, otp);

    // Send SMS
    const smsResult = await sendSmsOTP(
      authSettings.sms_019_user,
      authSettings.sms_019_token,
      authSettings.sms_019_source,
      normalizedPhone,
      message
    );

    if (!smsResult.success) {
      console.error("SMS send failed:", smsResult.error);
      return new Response(
        JSON.stringify({ success: false, error: "فشل في إرسال الرسالة النصية" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Log the attempt
    await supabase.from("login_attempts").insert({
      email: normalizedPhone,
      identifier: normalizedPhone,
      method: "sms_otp",
      success: false,
    });

    return new Response(
      JSON.stringify({ success: true, message: "تم إرسال رمز التحقق" }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error in auth-sms-start:", error);
    return new Response(
      JSON.stringify({ success: false, error: "حدث خطأ غير متوقع" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
