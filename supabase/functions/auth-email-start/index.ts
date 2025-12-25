import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailStartRequest {
  email: string;
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

// Send email via SMTP (Hostinger)
async function sendEmailViaSMTP(
  smtpHost: string,
  smtpPort: number,
  smtpSecure: boolean,
  smtpUser: string,
  smtpPassword: string,
  recipientEmail: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Sending OTP email via SMTP to ${recipientEmail}`);
    console.log(`SMTP Host: ${smtpHost}, Port: ${smtpPort}, Secure: ${smtpSecure}`);
    
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: smtpSecure,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    await client.send({
      from: smtpUser,
      to: recipientEmail,
      subject: subject,
      content: body,
      html: body.replace(/\n/g, '<br>'),
    });

    await client.close();
    console.log("Email sent successfully via SMTP");
    return { success: true };
  } catch (error: unknown) {
    console.error("SMTP email sending error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown SMTP error" };
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

    const { email }: EmailStartRequest = await req.json();

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "البريد الإلكتروني غير صالح" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limiting - max 3 OTPs per email per 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentOtps, error: rateLimitError } = await supabase
      .from("otp_codes")
      .select("id")
      .eq("identifier", normalizedEmail)
      .eq("channel", "email")
      .gte("created_at", tenMinutesAgo);

    if (rateLimitError) {
      console.error("Rate limit check error:", rateLimitError);
    }

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

    if (!authSettings.email_otp_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "تسجيل الدخول بالبريد غير مفعل" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check SMTP configuration
    const smtpHost = authSettings.smtp_host || "smtp.hostinger.com";
    const smtpPort = authSettings.smtp_port || 465;
    const smtpSecure = authSettings.smtp_secure !== false;
    const smtpUser = authSettings.smtp_user;
    const smtpPassword = authSettings.smtp_password;

    if (!smtpUser || !smtpPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "SMTP غير مكتمل. يرجى إعداد بيانات SMTP في إعدادات المصادقة." }),
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
        identifier: normalizedEmail,
        channel: "email",
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

    // Prepare email content
    const subject = (authSettings.email_subject_template || "رمز التحقق: {code}")
      .replace("{code}", otp);
    const body = (authSettings.email_body_template || "رمز التحقق الخاص بك هو: {code}")
      .replace(/{code}/g, otp);

    // Send email via SMTP
    const emailResult = await sendEmailViaSMTP(
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPassword,
      normalizedEmail,
      subject,
      body
    );

    if (!emailResult.success) {
      console.error("Email send failed:", emailResult.error);
      return new Response(
        JSON.stringify({ success: false, error: `فشل في إرسال البريد الإلكتروني: ${emailResult.error}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Log the attempt
    await supabase.from("login_attempts").insert({
      email: normalizedEmail,
      identifier: normalizedEmail,
      method: "email_otp",
      success: false, // Will be updated on verify
    });

    return new Response(
      JSON.stringify({ success: true, message: "تم إرسال رمز التحقق" }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error in auth-email-start:", error);
    return new Response(
      JSON.stringify({ success: false, error: "حدث خطأ غير متوقع" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
