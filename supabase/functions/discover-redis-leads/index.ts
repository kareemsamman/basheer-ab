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

// Parse lead info from chat messages
function parseLeadInfoFromMessages(messages: ChatMessage[]): {
  customer_name: string | null;
  car_manufacturer: string | null;
  car_model: string | null;
  car_year: string | null;
  car_number: string | null;
  insurance_types: string[];
  driver_over_24: boolean | null;
  has_accidents: boolean | null;
  requires_callback: boolean;
  total_price: number | null;
} {
  const result = {
    customer_name: null as string | null,
    car_manufacturer: null as string | null,
    car_model: null as string | null,
    car_year: null as string | null,
    car_number: null as string | null,
    insurance_types: [] as string[],
    driver_over_24: null as boolean | null,
    has_accidents: null as boolean | null,
    requires_callback: false,
    total_price: null as number | null,
  };

  const seenInsuranceTypes = new Set<string>();

  for (const msg of messages) {
    const content = msg.data?.content || "";

    // Check for callback request
    if (msg.type === "ai" && content.includes("تم تسجيل طلبك")) {
      result.requires_callback = true;
    }

    // Try to extract info from bot responses
    if (msg.type === "ai") {
      // Extract customer name from welcome message
      // Patterns: "مرحباً أحمد،" or "مرحبا يوسف!" or "أهلاً محمد"
      const namePatterns = [
        /مرحباً?\s*!?\s*([^،,!؟\n]+)[،,!]/,
        /أهلاً?\s*!?\s*([^،,!؟\n]+)[،,!]/,
        /هلا\s+([^،,!؟\n]+)[،,!]/,
      ];
      for (const pattern of namePatterns) {
        const nameMatch = content.match(pattern);
        if (nameMatch && !result.customer_name) {
          const name = nameMatch[1].trim();
          // Avoid false positives (skip if it's a generic phrase)
          if (name.length > 1 && name.length < 30 && !name.includes("بوت") && !name.includes("تأمين")) {
            result.customer_name = name;
          }
        }
      }

      // Look for car info patterns
      // Pattern 1: "سيارتك مازدا 3 موديل 2010"
      const carMatch1 = content.match(/سيارتك\s+(\S+)\s+(\S+)\s+موديل\s+(\d{4})/);
      if (carMatch1) {
        result.car_manufacturer = carMatch1[1];
        result.car_model = carMatch1[2];
        result.car_year = carMatch1[3];
      }

      // Pattern 2: "مازدا 3 - 2010" or "מזדה 3 2010"
      const carMatch2 = content.match(/(\S+)\s+(\S+)\s*[-–]\s*(\d{4})/);
      if (carMatch2 && !result.car_manufacturer) {
        result.car_manufacturer = carMatch2[1];
        result.car_model = carMatch2[2];
        result.car_year = carMatch2[3];
      }

      // Extract price - multiple patterns
      // Pattern 1: "السعر النهائي: ₪2600" or "السعر: 2600"
      const pricePatterns = [
        /السعر\s*(?:النهائي)?[:：]\s*[₪ש]?\s*(\d{3,5})/,
        /المجموع[:：]?\s*[₪ש]?\s*(\d{3,5})/,
        /الإجمالي[:：]?\s*[₪ש]?\s*(\d{3,5})/,
        /סה"כ[:：]?\s*[₪ש]?\s*(\d{3,5})/,
        /(\d{3,5})\s*[₪ש]/,
      ];
      for (const pattern of pricePatterns) {
        const priceMatch = content.match(pattern);
        if (priceMatch && !result.total_price) {
          result.total_price = parseInt(priceMatch[1]);
        }
      }

      // Extract insurance types
      if (content.includes("إلزامي") || content.includes("חובה")) {
        seenInsuranceTypes.add("إلزامي");
      }
      if (content.includes("شامل") || content.includes("מקיף")) {
        seenInsuranceTypes.add("شامل");
      }
      if (content.includes("طرف ثالث") || content.includes("צד ג")) {
        seenInsuranceTypes.add("طرف ثالث");
      }
    }

    // Extract car number from human messages
    if (msg.type === "human") {
      // Car number is typically 7-8 digits
      const carNumMatch = content.match(/^\s*(\d{7,8})\s*$/);
      if (carNumMatch) {
        result.car_number = carNumMatch[1];
      }
      
      // Check for age-related answers
      if (content.includes("لا") || content === "לא" || content.includes("فوق 24") || content.includes("מעל 24")) {
        result.driver_over_24 = true;
      } else if ((content.includes("نعم") || content === "כן") && (content.includes("تحت 24") || content.includes("מתחת"))) {
        result.driver_over_24 = false;
      }
      
      // Check for accidents answers
      if (content.includes("صحيح") || content === "نعم" || content === "כן" || content.includes("لا يوجد")) {
        result.has_accidents = false;
      }
      if (content.includes("نعم") && content.includes("حوادث")) {
        result.has_accidents = true;
      }
    }
  }

  result.insurance_types = Array.from(seenInsuranceTypes);

  return result;
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

    console.log("Connecting to Redis...");

    // Connect to Redis
    const redis = await connect({
      hostname: REDIS_HOST,
      port: parseInt(REDIS_PORT),
      password: REDIS_PASSWORD,
    });

    // Scan for all keys matching the WhatsApp phone pattern
    const keys: string[] = [];
    let cursor = 0;
    
    do {
      const result = await redis.scan(cursor, { pattern: "*@c.us", count: 100 });
      cursor = typeof result[0] === "string" ? parseInt(result[0]) : result[0];
      const foundKeys = result[1];
      
      for (const key of foundKeys) {
        // Only include LIST keys (chat history), not STRING keys (latest_batch)
        const keyType = await redis.type(key);
        if (keyType === "list") {
          keys.push(key);
        }
      }
    } while (cursor !== 0);

    console.log(`Found ${keys.length} chat keys in Redis`);

    if (keys.length === 0) {
      await redis.close();
      return new Response(
        JSON.stringify({ success: true, discovered: 0, created: 0, keys: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing leads by phone to avoid duplicates
    const phones = keys.map((k) => k.replace("@c.us", ""));
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("phone")
      .in("phone", phones);

    const existingPhones = new Set(existingLeads?.map((l) => l.phone) || []);
    
    console.log(`${existingPhones.size} leads already exist`);

    let created = 0;
    const newLeads: Array<{phone: string; lead_id: string}> = [];

    for (const key of keys) {
      const phone = key.replace("@c.us", "");
      
      // Skip if lead already exists
      if (existingPhones.has(phone)) {
        continue;
      }

      console.log(`Processing new lead: ${phone}`);

      // Get messages from Redis to parse lead info
      const messages = await redis.lrange(key, 0, -1);
      const parsedMessages: ChatMessage[] = [];
      
      for (const msgStr of messages) {
        try {
          const msg: ChatMessage = JSON.parse(msgStr);
          parsedMessages.push(msg);
        } catch {
          // Skip unparseable messages
        }
      }

      // Parse lead info from messages
      const leadInfo = parseLeadInfoFromMessages(parsedMessages);

      // Create the lead
      const { data, error } = await supabase
        .from("leads")
        .insert({
          phone,
          customer_name: leadInfo.customer_name,
          car_number: leadInfo.car_number,
          car_manufacturer: leadInfo.car_manufacturer,
          car_model: leadInfo.car_model,
          car_year: leadInfo.car_year,
          insurance_types: leadInfo.insurance_types.length > 0 ? leadInfo.insurance_types : null,
          driver_over_24: leadInfo.driver_over_24,
          has_accidents: leadInfo.has_accidents,
          requires_callback: leadInfo.requires_callback,
          source: "whatsapp",
          status: "new",
        })
        .select("id")
        .single();

      if (error) {
        console.error(`Error creating lead for ${phone}:`, error);
        continue;
      }

      created++;
      newLeads.push({ phone, lead_id: data.id });

      // Also sync the messages for this lead
      const leadMessages = parsedMessages.map((msg) => ({
        lead_id: data.id,
        phone: key,
        message_type: msg.type,
        content: msg.data?.content || "",
        metadata: {
          additional_kwargs: msg.data?.additional_kwargs || {},
          response_metadata: msg.data?.response_metadata || {},
        },
      }));

      if (leadMessages.length > 0) {
        const { error: msgError } = await supabase
          .from("lead_messages")
          .insert(leadMessages);
        
        if (msgError) {
          console.error(`Error syncing messages for ${phone}:`, msgError);
        }
      }
    }

    await redis.close();

    console.log(`Discovery complete: ${created} new leads created`);

    return new Response(
      JSON.stringify({
        success: true,
        discovered: keys.length,
        existing: existingPhones.size,
        created,
        newLeads,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Discovery error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
