import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestSMTPRequest {
  testEmail: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { testEmail }: TestSMTPRequest = await req.json();

    if (!testEmail || !testEmail.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "البريد الإلكتروني غير صالح" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
        JSON.stringify({ success: false, error: "خطأ في تحميل إعدادات المصادقة" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get SMTP configuration
    const smtpHost = authSettings.smtp_host || "smtp.hostinger.com";
    const smtpPort = authSettings.smtp_port || 465;
    const smtpSecure = authSettings.smtp_secure !== false;
    const smtpUser = authSettings.smtp_user;
    const smtpPassword = authSettings.smtp_password;

    if (!smtpUser || !smtpPassword) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "إعدادات SMTP غير مكتملة. يرجى إدخال اسم المستخدم وكلمة المرور." 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Testing SMTP connection to ${smtpHost}:${smtpPort}`);
    console.log(`SMTP User: ${smtpUser}, Secure: ${smtpSecure}`);

    try {
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
        to: testEmail,
        subject: "اختبار إعدادات SMTP - AB Insurance CRM",
        content: "تم إرسال هذه الرسالة بنجاح من نظام AB Insurance CRM.\n\nإعدادات SMTP تعمل بشكل صحيح!",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #2563eb;">✅ اختبار SMTP ناجح!</h2>
            <p>تم إرسال هذه الرسالة بنجاح من نظام <strong>AB Insurance CRM</strong>.</p>
            <p>إعدادات SMTP تعمل بشكل صحيح!</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              SMTP Host: ${smtpHost}<br>
              SMTP Port: ${smtpPort}<br>
              Secure: ${smtpSecure ? 'Yes (TLS)' : 'No'}
            </p>
          </div>
        `,
      });

      await client.close();
      
      console.log("Test email sent successfully");

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `تم إرسال بريد اختباري بنجاح إلى ${testEmail}` 
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );

    } catch (smtpError: unknown) {
      console.error("SMTP connection/send error:", smtpError);
      const errorMessage = smtpError instanceof Error ? smtpError.message : "Unknown SMTP error";
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `فشل الاتصال بـ SMTP: ${errorMessage}` 
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

  } catch (error) {
    console.error("Error in test-smtp:", error);
    return new Response(
      JSON.stringify({ success: false, error: "حدث خطأ غير متوقع" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
