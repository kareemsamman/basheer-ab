import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connect } from "https://deno.land/x/redis@v0.31.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  type: "ai" | "human";
  data: {
    content: string;
    additional_kwargs?: Record<string, unknown>;
    response_metadata?: Record<string, unknown>;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const REDIS_HOST = Deno.env.get("REDIS_HOST");
    const REDIS_PORT = Deno.env.get("REDIS_PORT");
    const REDIS_PASSWORD = Deno.env.get("REDIS_PASSWORD");

    if (!REDIS_HOST || !REDIS_PORT || !REDIS_PASSWORD) {
      throw new Error("Missing Redis configuration");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { phone, lead_id } = await req.json();

    if (!phone || !lead_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing phone or lead_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing chat for phone: ${phone}, lead_id: ${lead_id}`);

    // Connect to Redis using the correct connect function
    const redis = await connect({
      hostname: REDIS_HOST,
      port: parseInt(REDIS_PORT),
      password: REDIS_PASSWORD,
    });

    // The key format based on the screenshot: {phone}@c.us
    const redisKey = phone.includes("@c.us") ? phone : `${phone}@c.us`;
    
    console.log(`Fetching from Redis key: ${redisKey}`);

    // Get all messages from the list
    const messages = await redis.lrange(redisKey, 0, -1);
    
    console.log(`Found ${messages.length} messages in Redis`);

    if (messages.length === 0) {
      await redis.close();
      return new Response(
        JSON.stringify({ success: true, messages: [], synced: 0, requiresCallback: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse messages and prepare for insert
    const parsedMessages: Array<{
      lead_id: string;
      phone: string;
      message_type: string;
      content: string;
      metadata: Record<string, unknown>;
    }> = [];

    let requiresCallback = false;

    for (const msgStr of messages) {
      try {
        const msg: ChatMessage = JSON.parse(msgStr);
        
        const content = msg.data?.content || "";
        
        // Check if bot says "تم تسجيل طلبك"
        if (msg.type === "ai" && content.includes("تم تسجيل طلبك")) {
          requiresCallback = true;
        }

        parsedMessages.push({
          lead_id,
          phone: redisKey,
          message_type: msg.type,
          content,
          metadata: {
            additional_kwargs: msg.data?.additional_kwargs || {},
            response_metadata: msg.data?.response_metadata || {},
          },
        });
      } catch (parseError) {
        console.error("Error parsing message:", parseError);
      }
    }

    // Delete existing messages for this lead (full resync)
    await supabase
      .from("lead_messages")
      .delete()
      .eq("lead_id", lead_id);

    // Insert all messages
    if (parsedMessages.length > 0) {
      const { error: insertError } = await supabase
        .from("lead_messages")
        .insert(parsedMessages);

      if (insertError) {
        console.error("Error inserting messages:", insertError);
        throw insertError;
      }
    }

    // Update lead with sync time and callback status
    const updateData: Record<string, unknown> = {
      last_sync_at: new Date().toISOString(),
    };

    if (requiresCallback) {
      updateData.requires_callback = true;
    }

    await supabase
      .from("leads")
      .update(updateData)
      .eq("id", lead_id);

    await redis.close();

    console.log(`Successfully synced ${parsedMessages.length} messages, requiresCallback: ${requiresCallback}`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: parsedMessages.length,
        requiresCallback,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
