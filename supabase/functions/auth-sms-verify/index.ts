import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmsVerifyRequest {
  phone: string;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { phone, code }: SmsVerifyRequest = await req.json();

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ success: false, error: "رقم الهاتف والرمز مطلوبان" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    const codeHash = await hashOTP(code.trim());

    // Find valid OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("identifier", normalizedPhone)
      .eq("channel", "sms")
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

    // Check if user exists by phone in profiles
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, status, email, phone")
      .eq("phone", normalizedPhone)
      .single();

    let userId: string;
    let userStatus: string;
    let userEmail: string | null;

    if (existingProfile) {
      userId = existingProfile.id;
      userStatus = existingProfile.status;
      userEmail = existingProfile.email;
    } else {
      // Create a new user with phone-based email
      const phoneEmail = `${normalizedPhone}@phone.local`;
      const tempPassword = crypto.randomUUID() + crypto.randomUUID();
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: phoneEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          phone: normalizedPhone,
        }
      });

      if (createError || !newUser.user) {
        console.error("User creation error:", createError);
        return new Response(
          JSON.stringify({ success: false, error: "فشل في إنشاء حساب المستخدم" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      userId = newUser.user.id;
      userStatus = "pending";
      userEmail = phoneEmail;

      // Update profile with phone number
      await supabase
        .from("profiles")
        .update({ phone: normalizedPhone })
        .eq("id", userId);
    }

    // Update login attempt
    await supabase
      .from("login_attempts")
      .update({ success: true, user_id: userId })
      .eq("identifier", normalizedPhone)
      .eq("method", "sms_otp")
      .eq("success", false)
      .order("created_at", { ascending: false })
      .limit(1);

    // Generate session for the user
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail || `${normalizedPhone}@phone.local`,
    });

    if (sessionError) {
      console.error("Session generation error:", sessionError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        status: userStatus,
        phone: normalizedPhone,
        is_active: userStatus === "active",
        magic_link_token: sessionData?.properties?.hashed_token,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error in auth-sms-verify:", error);
    return new Response(
      JSON.stringify({ success: false, error: "حدث خطأ غير متوقع" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
