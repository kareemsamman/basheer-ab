import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailVerifyRequest {
  email: string;
  code: string;
}

// Hash OTP for comparison
async function hashOTP(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, code }: EmailVerifyRequest = await req.json();

    if (!email || !code) {
      return new Response(
        JSON.stringify({ success: false, error: "البريد الإلكتروني والرمز مطلوبان" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const codeHash = await hashOTP(code.trim());

    // Find valid OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("identifier", normalizedEmail)
      .eq("channel", "email")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "لا يوجد رمز صالح. اطلب رمزاً جديداً." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check attempts
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      await supabase
        .from("otp_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", otpRecord.id);

      return new Response(
        JSON.stringify({ success: false, error: "تم تجاوز الحد الأقصى للمحاولات. اطلب رمزاً جديداً." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Increment attempts
    await supabase
      .from("otp_codes")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    // Verify OTP hash
    if (otpRecord.otp_hash !== codeHash) {
      const remainingAttempts = otpRecord.max_attempts - otpRecord.attempts - 1;
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `رمز التحقق غير صحيح. ${remainingAttempts} محاولات متبقية.` 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark OTP as used
    await supabase
      .from("otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    // User must already exist (we checked in auth-email-start)
    // Just get the profile
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, status, email")
      .eq("email", normalizedEmail)
      .single();

    if (profileError || !existingProfile) {
      return new Response(
        JSON.stringify({ success: false, error: "المستخدم غير موجود في النظام." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = existingProfile.id;
    const userStatus = existingProfile.status;

    // Update login attempt
    await supabase
      .from("login_attempts")
      .update({ success: true, user_id: userId })
      .eq("email", normalizedEmail)
      .eq("method", "email_otp")
      .eq("success", false)
      .order("created_at", { ascending: false })
      .limit(1);

    // Only generate session if user is active
    let magicLinkToken = null;
    if (userStatus === "active") {
      const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
      });

      if (sessionError) {
        console.error("Session generation error:", sessionError);
      } else {
        magicLinkToken = sessionData?.properties?.hashed_token;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        status: userStatus,
        email: normalizedEmail,
        is_active: userStatus === "active",
        magic_link_token: magicLinkToken,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error in auth-email-verify:", error);
    return new Response(
      JSON.stringify({ success: false, error: "حدث خطأ غير متوقع" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
