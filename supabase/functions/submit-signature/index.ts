import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitSignatureRequest {
  token: string;
  signature_data_url: string; // Base64 data URL of signature image
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, signature_data_url }: SubmitSignatureRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!signature_data_url) {
      return new Response(
        JSON.stringify({ error: "Signature data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[submit-signature] Processing token: ${token.substring(0, 8)}...`);

    // Find signature record by token
    const { data: signatureRecord, error: signatureError } = await supabase
      .from("customer_signatures")
      .select("*, client:clients(id, full_name, signature_url)")
      .eq("token", token)
      .maybeSingle();

    if (signatureError || !signatureRecord) {
      console.error("[submit-signature] Token not found:", signatureError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired signature link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (signatureRecord.token_expires_at && new Date(signatureRecord.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Signature link has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already signed (has signature_image_url)
    if (signatureRecord.signature_image_url && signatureRecord.signature_image_url !== "") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Signature already submitted",
          signed_at: signatureRecord.signed_at
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload signature to Bunny CDN
    const bunnyApiKey = Deno.env.get("BUNNY_API_KEY");
    const bunnyStorageZone = Deno.env.get("BUNNY_STORAGE_ZONE");
    // Hardcode CDN URL as the secret was misconfigured
    const bunnyCdnUrl = 'https://basheer-ab.b-cdn.net';

    if (!bunnyApiKey || !bunnyStorageZone) {
      console.error("[submit-signature] Missing Bunny configuration");
      return new Response(
        JSON.stringify({ error: "Storage configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert base64 to binary
    const base64Data = signature_data_url.split(",")[1];
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `signatures/${signatureRecord.client_id}/${timestamp}.png`;

    // Upload to Bunny Storage
    const uploadResponse = await fetch(
      `https://storage.bunnycdn.com/${bunnyStorageZone}/${fileName}`,
      {
        method: "PUT",
        headers: {
          "AccessKey": bunnyApiKey,
          "Content-Type": "image/png",
        },
        body: binaryData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("[submit-signature] Bunny upload failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to upload signature" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signatureImageUrl = `${bunnyCdnUrl}/${fileName}`;
    console.log(`[submit-signature] Signature uploaded: ${signatureImageUrl}`);

    // Get request metadata
    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("cf-connecting-ip") || 
                      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Update signature record
    const { error: updateSignatureError } = await supabase
      .from("customer_signatures")
      .update({
        signature_image_url: signatureImageUrl,
        signed_at: new Date().toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
        token: null, // Invalidate token after use
        token_expires_at: null,
      })
      .eq("id", signatureRecord.id);

    if (updateSignatureError) {
      console.error("[submit-signature] Error updating signature record:", updateSignatureError);
    }

    // Update client with permanent signature URL
    const { error: updateClientError } = await supabase
      .from("clients")
      .update({ signature_url: signatureImageUrl })
      .eq("id", signatureRecord.client_id);

    if (updateClientError) {
      console.error("[submit-signature] Error updating client:", updateClientError);
    }

    const duration = Date.now() - startTime;
    console.log(`[submit-signature] Completed in ${duration}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Signature submitted successfully",
        signature_url: signatureImageUrl,
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[submit-signature] Fatal error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
