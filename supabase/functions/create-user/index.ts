import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Domain used to build a synthetic auth email when the admin only sets a
// username (no real email). Login still works via signInWithPassword.
const USERNAME_EMAIL_DOMAIN = "staff.local";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "غير مصرح" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json({ error: "غير مصرح" });
    }

    // Check caller is admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) {
      return json({ error: "صلاحيات غير كافية" });
    }

    const body = await req.json();
    const role = body.role;
    const full_name: string | null = body.full_name ?? null;
    const branch_id: string | null = body.branch_id ?? null;
    const password: string | undefined = body.password?.trim();

    let email: string | null = body.email?.trim()?.toLowerCase() || null;
    let username: string | null = body.username?.trim() || null;

    if (!role || !["admin", "worker"].includes(role)) {
      return json({ error: "بيانات غير صالحة" });
    }

    // Need at least a username or an email to identify the account.
    if (!email && !username) {
      return json({ error: "يجب إدخال اسم المستخدم أو البريد الإلكتروني" });
    }

    // Password is required for the new username/password login flow.
    if (!password || password.length < 6) {
      return json({ error: "كلمة المرور مطلوبة (٦ أحرف على الأقل)" });
    }

    // Validate username format (no spaces, no @ so it can't collide with emails).
    if (username) {
      if (/[@\s]/.test(username)) {
        return json({ error: "اسم المستخدم لا يجوز أن يحتوي مسافات أو @" });
      }

      // Reject duplicate usernames (case-insensitive).
      const { data: existing } = await adminClient
        .from("profiles")
        .select("id")
        .ilike("username", username.replace(/[\\%_]/g, "\\$&"))
        .maybeSingle();

      if (existing) {
        return json({ error: "اسم المستخدم مستخدم بالفعل" });
      }
    }

    // The auth email: a real email if given, otherwise synthesized from username.
    const authEmail = email ?? `${username!.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;

    // Create auth user with a password and confirmed email (no verification step).
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    });

    if (authError) {
      console.error("Auth create error:", authError);
      const msg = /already been registered|already exists/i.test(authError.message)
        ? "البريد الإلكتروني مستخدم بالفعل"
        : authError.message;
      return json({ error: msg });
    }

    const newUserId = authData.user.id;

    // Update profile (handle_new_user trigger already inserted the base row).
    const profileUpdate: Record<string, unknown> = { status: "active" };
    if (full_name) profileUpdate.full_name = full_name;
    if (branch_id) profileUpdate.branch_id = branch_id;
    if (username) profileUpdate.username = username;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", newUserId);

    if (profileError) {
      console.error("Profile update error:", profileError);
    }

    // Insert role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({ user_id: newUserId, role });

    if (roleError) {
      console.error("Role insert error:", roleError);
    }

    return json({ success: true, user_id: newUserId });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "حدث خطأ غير متوقع" });
  }
});
