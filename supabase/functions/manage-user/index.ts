import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const USERNAME_EMAIL_DOMAIN = "staff.local";
const SUPER_ADMIN_EMAIL = "morshed500@gmail.com";

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
    if (!authHeader) return json({ error: "غير مصرح" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: caller }, error: callerError } =
      await callerClient.auth.getUser();
    if (callerError || !caller) return json({ error: "غير مصرح" });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!callerRole) return json({ error: "صلاحيات غير كافية" });

    const body = await req.json();
    const action: "update" | "delete" = body.action;
    const user_id: string = body.user_id;
    if (!action || !user_id) return json({ error: "بيانات غير صالحة" });

    // Protect super admin from destructive changes
    const { data: target } = await admin
      .from("profiles")
      .select("email")
      .eq("id", user_id)
      .maybeSingle();
    if (target?.email === SUPER_ADMIN_EMAIL) {
      return json({ error: "لا يمكن تعديل مدير النظام" });
    }

    if (action === "delete") {
      await admin.from("user_roles").delete().eq("user_id", user_id);
      await admin.from("profiles").delete().eq("id", user_id);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message });
      return json({ success: true });
    }

    if (action === "update") {
      const full_name: string | null | undefined = body.full_name;
      const username: string | null | undefined = body.username;
      const email: string | null | undefined = body.email;
      const password: string | undefined = body.password;
      const role: "admin" | "worker" | undefined = body.role;

      // Username uniqueness
      if (username) {
        if (/[@\s]/.test(username)) {
          return json({ error: "اسم المستخدم لا يجوز أن يحتوي مسافات أو @" });
        }
        const { data: existing } = await admin
          .from("profiles")
          .select("id")
          .ilike("username", username.replace(/[\\%_]/g, "\\$&"))
          .neq("id", user_id)
          .maybeSingle();
        if (existing) return json({ error: "اسم المستخدم مستخدم بالفعل" });
      }

      // Auth update
      const authPatch: Record<string, unknown> = {};
      if (email) authPatch.email = email.toLowerCase();
      else if (username && !email) {
        authPatch.email = `${username.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
      }
      if (password) {
        if (password.length < 6) {
          return json({ error: "كلمة المرور يجب ٦ أحرف على الأقل" });
        }
        authPatch.password = password;
      }
      if (Object.keys(authPatch).length > 0) {
        const { error: authErr } = await admin.auth.admin.updateUserById(
          user_id,
          authPatch,
        );
        if (authErr) {
          const msg = /already been registered|already exists/i.test(
              authErr.message,
            )
            ? "البريد الإلكتروني مستخدم بالفعل"
            : authErr.message;
          return json({ error: msg });
        }
      }

      // Profile update
      const profilePatch: Record<string, unknown> = {};
      if (full_name !== undefined) profilePatch.full_name = full_name;
      if (username !== undefined) profilePatch.username = username;
      if (email !== undefined) profilePatch.email = email?.toLowerCase() ?? null;
      if (Object.keys(profilePatch).length > 0) {
        await admin.from("profiles").update(profilePatch).eq("id", user_id);
      }

      // Role update
      if (role && ["admin", "worker"].includes(role)) {
        await admin.from("user_roles").delete().eq("user_id", user_id);
        await admin.from("user_roles").insert({ user_id, role });
      }

      return json({ success: true });
    }

    return json({ error: "إجراء غير معروف" });
  } catch (err) {
    console.error("manage-user error:", err);
    return json({ error: "حدث خطأ غير متوقع" });
  }
});
