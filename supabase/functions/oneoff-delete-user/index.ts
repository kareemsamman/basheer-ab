import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { email } = await req.json();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500 });
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  await admin.from("user_roles").delete().eq("user_id", user.id);
  await admin.from("profiles").delete().eq("id", user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ success: true, id: user.id }), { headers: { "Content-Type": "application/json" } });
});
