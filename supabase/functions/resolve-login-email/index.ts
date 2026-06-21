import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Translates a typed username into the auth email used by Supabase, so an
// employee can sign in with either their username or email + password.
// Password is still verified client-side via signInWithPassword.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier } = await req.json();
    const value = (identifier ?? "").trim();

    if (!value) {
      return json({ success: false, error: "مطلوب اسم مستخدم أو بريد" });
    }

    // Already an email — nothing to resolve.
    if (value.includes("@")) {
      return json({ success: true, email: value.toLowerCase() });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Case-insensitive exact match on username (escape LIKE wildcards).
    const escaped = value.replace(/[\\%_]/g, "\\$&");
    const { data, error } = await adminClient
      .from("profiles")
      .select("email")
      .ilike("username", escaped)
      .maybeSingle();

    if (error) {
      console.error("Lookup error:", error);
      return json({ success: false, error: "حدث خطأ غير متوقع" });
    }

    if (!data?.email) {
      return json({ success: false, error: "اسم المستخدم غير موجود" });
    }

    return json({ success: true, email: data.email });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ success: false, error: "حدث خطأ غير متوقع" });
  }
});
