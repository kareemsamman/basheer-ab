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
  textContent: string,
  htmlContent: string
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
      content: textContent,
      html: htmlContent,
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

    // IMPORTANT: Check if user exists and has access BEFORE sending OTP
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, status, email")
      .eq("email", normalizedEmail)
      .single();

    if (profileError || !existingProfile) {
      console.log("No profile found for email:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, error: "هذا البريد الإلكتروني غير مسجل في النظام. تواصل مع المدير للحصول على صلاحية الدخول." }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (existingProfile.status === "blocked") {
      return new Response(
        JSON.stringify({ success: false, error: "تم حظر هذا الحساب. تواصل مع المدير." }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

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

    // Prepare email content - use proper line breaks, not \n
    const subject = "رمز التحقق - AB Insurance CRM";
    
    // Plain text version with proper line breaks
    const textContent = `رمز التحقق الخاص بك هو: ${otp}

هذا الرمز صالح لمدة 5 دقائق فقط.

إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة.`;
    
    // HTML version with proper styling
    const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; padding: 20px; direction: rtl; text-align: right; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #2563eb; margin: 0; font-size: 28px;">AB Insurance CRM</h1>
      <p style="color: #6b7280; margin-top: 8px;">نظام إدارة التأمين</p>
    </div>
    
    <p style="font-size: 18px; color: #374151; margin-bottom: 24px; text-align: center;">
      رمز التحقق الخاص بك هو:
    </p>
    
    <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; font-size: 36px; font-weight: bold; padding: 24px; text-align: center; border-radius: 12px; letter-spacing: 12px; margin-bottom: 24px;">
      ${otp}
    </div>
    
    <p style="font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 16px;">
      هذا الرمز صالح لمدة <strong>5 دقائق</strong> فقط.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة.
    </p>
  </div>
</body>
</html>`;

    // Send email via SMTP
    const emailResult = await sendEmailViaSMTP(
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPassword,
      normalizedEmail,
      subject,
      textContent,
      htmlContent
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
      success: false,
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
