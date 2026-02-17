import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { offset = 0, limit = 20 } = await req.json();

    // 1. Fetch settings
    const { data: settings, error: settingsErr } = await supabase
      .from("xservice_settings")
      .select("*")
      .limit(1)
      .single();

    if (settingsErr || !settings || !settings.is_enabled || !settings.api_url || !settings.api_key) {
      return new Response(JSON.stringify({ error: "X-Service not configured or disabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Build type filter
    const types: string[] = [];
    if (settings.sync_road_service) types.push("ROAD_SERVICE");
    if (settings.sync_accident_fee) types.push("ACCIDENT_FEE_EXEMPTION");
    if (types.length === 0) {
      return new Response(JSON.stringify({ error: "No sync types enabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Get total count
    const { count: totalCount } = await supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .in("policy_type_parent", types);

    // 4. Fetch batch
    const { data: policies, error: pErr } = await supabase
      .from("policies")
      .select("id, policy_type_parent, policy_number, start_date, end_date, insurance_price, payed_for_company, notes, car_id, client_id")
      .in("policy_type_parent", types)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (pErr || !policies) {
      return new Response(JSON.stringify({ error: "Failed to fetch policies" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawUrl = settings.api_url.replace(/\/+$/, "");
    const syncUrl = rawUrl.includes("/functions/v1/")
      ? rawUrl
      : `${rawUrl}/functions/v1/ab-sync-receive`;

    let synced = 0;
    let failed = 0;

    for (const policy of policies) {
      try {
        // Fetch client
        const { data: client } = await supabase
          .from("clients")
          .select("full_name, id_number, phone_number, phone_number_2, birth_date")
          .eq("id", policy.client_id)
          .single();

        // Fetch car
        let car = null;
        if (policy.car_id) {
          const { data: carData } = await supabase
            .from("cars")
            .select("car_number, car_type, manufacturer_name, model, year, color")
            .eq("id", policy.car_id)
            .single();
          car = carData;
        }

        const serviceType = policy.policy_type_parent === "ROAD_SERVICE" ? "road_service" : "accident_fee";

        const requestPayload = {
          api_key: settings.api_key,
          customer: {
            full_name: client?.full_name || "",
            id_number: client?.id_number || "",
            phone1: client?.phone_number || "",
            phone2: client?.phone_number_2 || "",
            birth_date: client?.birth_date || null,
          },
          car: {
            car_number: car?.car_number || "",
            car_type: car?.car_type || null,
            manufacturer: car?.manufacturer_name || "",
            model: car?.model || "",
            year: car?.year || null,
            color: car?.color || "",
          },
          policy: {
            service_type: serviceType,
            start_date: policy.start_date,
            end_date: policy.end_date,
            sell_price: policy.payed_for_company || 0,
            notes: policy.notes || "",
          },
        };

        const response = await fetch(syncUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        });

        const responseBody = await response.json().catch(() => null);

        if (response.ok) {
          synced++;
          const xservicePolicyId = responseBody?.policy_id || responseBody?.policy_number || null;
          await supabase.from("xservice_sync_log").insert({
            policy_id: policy.id,
            status: "success",
            xservice_policy_id: xservicePolicyId,
            request_payload: requestPayload,
            response_payload: responseBody,
          });
        } else {
          failed++;
          await supabase.from("xservice_sync_log").insert({
            policy_id: policy.id,
            status: "failed",
            error_message: responseBody?.error || `HTTP ${response.status}`,
            request_payload: requestPayload,
            response_payload: responseBody,
          });
        }
      } catch (e) {
        failed++;
        await supabase.from("xservice_sync_log").insert({
          policy_id: policy.id,
          status: "failed",
          error_message: String(e),
          request_payload: {},
          response_payload: null,
        });
      }
    }

    const done = offset + policies.length >= (totalCount || 0);

    return new Response(JSON.stringify({
      synced,
      failed,
      processed: policies.length,
      total: totalCount || 0,
      done,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bulk-sync-to-xservice] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
