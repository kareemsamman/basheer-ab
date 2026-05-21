import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert accountant analyzing insurance company statements (كشف حساب / דוח חשבון).
The user uploads images and/or PDFs of an external statement from an insurance company or broker.

Your job: extract every line item as a normalized JSON, plus metadata.

CRITICAL RULES:
1. Extract the CAR NUMBER (رقم السيارة / מספר רכב / لوحة السيارة) as the unique key for each row. Strip all non-digit characters. If the row has no car number, set car_number to null.
2. The amount column you should extract is the AMOUNT THE AGENCY OWES THE COMPANY (or the inverse - whatever single financial column is the dominant per-row figure). Common headers: "המגיע לחברה", "המגיע מהסוכן", "סכום", "المستحق للشركة", "صافي", "المبلغ". If multiple columns exist, pick ONE — the one that best represents the per-policy financial value — and report which column you picked in "column_used".
3. Amounts: comma is thousands separator. "1,800" = 1800. Negative amounts (refunds) keep their sign.
4. Detect the COMPANY NAME printed on the statement header.
5. Detect the PERIOD covered by the statement (e.g. "01/01/2026 - 31/01/2026" or month name).
6. If a Grand Total / סה"כ / المجموع line is printed at the bottom, extract it as grand_total. If not printed, set grand_total to null — DO NOT invent or sum yourself.
7. Each row's raw_label should be a short identifier from the row (client name, policy number, anything human-readable) so the user can locate it visually.
8. Skip header rows, footer rows, and summary rows.

OUTPUT STRICT JSON (no markdown, no commentary):
{
  "company": "string or null",
  "period": "string or null",
  "column_used": "string describing which column you picked",
  "grand_total": number or null,
  "notes": "string - any caveats, ambiguities, columns you ignored, rotation issues, low confidence pages",
  "rows": [
    { "car_number": "1234567" | null, "amount": 1234.5, "raw_label": "client name or policy id" }
  ]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { files, hint } = await req.json();
    if (!Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build multimodal content: text + each file as image_url (data URL works for images + PDFs on Gemini)
    const content: any[] = [
      { type: "text", text: `${SYSTEM_PROMPT}\n\nContext from user: ${hint || "(none)"}` },
    ];
    for (const f of files) {
      // f: { name, mime, base64 }
      const dataUrl = `data:${f.mime};base64,${f.base64}`;
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content }],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("[audit-statement] AI error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit", message: "تم تجاوز الحد المسموح. حاول لاحقاً." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required", message: "نفد رصيد الذكاء الاصطناعي. الرجاء شحن الحساب." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "ai_error", message: `AI gateway error ${aiResp.status}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    let text: string = aiData?.choices?.[0]?.message?.content || "";

    // Strip markdown fences
    text = text.trim();
    if (text.startsWith("```json")) text = text.slice(7);
    else if (text.startsWith("```")) text = text.slice(3);
    if (text.endsWith("```")) text = text.slice(0, -3);
    text = text.trim();

    // Try parse — if it isn't pure JSON, try to extract the first {...} block
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI did not return valid JSON");
      parsed = JSON.parse(m[0]);
    }

    // Normalize
    const rows = Array.isArray(parsed.rows) ? parsed.rows.map((r: any) => ({
      car_number: r.car_number ? String(r.car_number).replace(/\D/g, "") || null : null,
      amount: Number(r.amount) || 0,
      raw_label: String(r.raw_label || ""),
    })) : [];

    return new Response(JSON.stringify({
      success: true,
      company: parsed.company || null,
      period: parsed.period || null,
      column_used: parsed.column_used || null,
      grand_total: parsed.grand_total != null ? Number(parsed.grand_total) : null,
      notes: parsed.notes || "",
      rows,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[audit-statement] error", e);
    return new Response(JSON.stringify({ error: "server_error", message: e instanceof Error ? e.message : "خطأ" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
