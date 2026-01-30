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

// Pre-initialize Supabase client at module level to avoid cold start delay
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: EmailStartRequest = await req.json();

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "البريد الإلكتروني غير صالح" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Parallel fetch: profile, auth settings, and rate limit check - MUCH faster
    const [profileResult, authSettingsResult, rateLimitResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, status, email, full_name")
        .eq("email", normalizedEmail)
        .single(),
      supabase
        .from("auth_settings")
        .select("*")
        .limit(1)
        .single(),
      supabase
        .from("otp_codes")
        .select("id")
        .eq("identifier", normalizedEmail)
        .eq("channel", "email")
        .gte("created_at", tenMinutesAgo)
    ]);

    const { data: existingProfile, error: profileError } = profileResult;
    const { data: authSettings, error: settingsError } = authSettingsResult;
    const { data: recentOtps } = rateLimitResult;

    // If no profile found, create a pending one
    if (profileError || !existingProfile) {
      console.log("No profile found for email, creating pending profile:", normalizedEmail);

      const requestedName = normalizedEmail.split("@")[0];
      let userId: string | null = null;

      const { data: createdUserRes, error: createUserError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: { full_name: requestedName },
      });

      if (createUserError) {
        console.error("Auth user create error:", createUserError);
        const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

        if (listError) {
          console.error("Auth list users error:", listError);
        } else {
          const found = usersPage?.users?.find(
            (u: any) => (u.email ?? "").toLowerCase() === normalizedEmail
          );
          userId = found?.id ?? null;
        }
      } else {
        userId = createdUserRes.user?.id ?? null;
      }

      if (!userId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "تعذر تسجيل الطلب حالياً. حاول لاحقاً أو تواصل مع المدير.",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            email: normalizedEmail,
            full_name: requestedName,
            status: "pending",
          },
          { onConflict: "id" }
        );

      if (upsertError) {
        console.error("Error upserting pending profile:", upsertError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "تعذر تسجيل الطلب حالياً. حاول لاحقاً أو تواصل مع المدير.",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Get IP and User-Agent from request
      const ip_address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
        || req.headers.get("cf-connecting-ip") 
        || req.headers.get("x-real-ip")
        || null;
      const user_agent = req.headers.get("user-agent") || null;

      // Log attempt in background (don't wait)
      supabase.from("login_attempts").insert({
        email: normalizedEmail,
        identifier: normalizedEmail,
        method: "email_otp",
        success: false,
        ip_address,
        user_agent,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "تم تسجيل طلبك. يرجى انتظار موافقة المدير للحصول على صلاحية الدخول.",
          pending: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if user is blocked
    if (existingProfile.status === "blocked") {
      return new Response(
        JSON.stringify({ success: false, error: "تم حظر هذا الحساب. تواصل مع المدير." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if user is still pending
    if (existingProfile.status === "pending") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "حسابك قيد المراجعة. يرجى انتظار موافقة المدير.",
          pending: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limit check (already fetched in parallel)
    if (recentOtps && recentOtps.length >= 3) {
      return new Response(
        JSON.stringify({ success: false, error: "تم تجاوز الحد الأقصى للمحاولات. حاول لاحقاً." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Auth settings check (already fetched in parallel)
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

    // Generate OTP and hash in parallel with preparing email content
    const otp = generateOTP();
    const [otpHash] = await Promise.all([hashOTP(otp)]);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

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
    const subject = "رمز التحقق - AB Insurance CRM";
    const textContent = `رمز التحقق الخاص بك هو: ${otp}\r\n\r\nهذا الرمز صالح لمدة 5 دقائق فقط.\r\n\r\nإذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة.`;
    const htmlContent = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;padding:20px;direction:rtl;text-align:center;background:#f3f4f6;"><div style="max-width:500px;margin:0 auto;background:#fff;padding:30px;border-radius:12px;"><h1 style="color:#2563eb;margin:0 0 8px 0;">AB Insurance CRM</h1><p style="color:#6b7280;margin:0 0 20px 0;">نظام إدارة التأمين</p><p style="color:#374151;margin:0 0 20px 0;">رمز التحقق الخاص بك هو:</p><div style="background:#2563eb;color:#fff;font-size:32px;font-weight:bold;padding:20px;border-radius:10px;letter-spacing:10px;margin:0 0 20px 0;">${otp}</div><p style="color:#6b7280;margin:0 0 20px 0;">هذا الرمز صالح لمدة 5 دقائق فقط.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"><p style="color:#9ca3af;font-size:12px;margin:0;">إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة.</p></div></body></html>`;

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

    // Get IP and User-Agent from request
    const ip_address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("cf-connecting-ip") 
      || req.headers.get("x-real-ip")
      || null;
    const user_agent = req.headers.get("user-agent") || null;

    // Log attempt in background (don't await)
    supabase.from("login_attempts").insert({
      email: normalizedEmail,
      identifier: normalizedEmail,
      method: "email_otp",
      success: false,
      ip_address,
      user_agent,
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
