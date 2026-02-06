import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BoundingBox {
  x: number; // percentage from left (0-100)
  y: number; // percentage from top (0-100)
  width: number; // percentage of image width
  height: number; // percentage of image height
}

interface DetectedCheque {
  cheque_number: string;
  payment_date: string; // YYYY-MM-DD
  amount: number;
  bank_name: string;
  account_number: string;
  branch_number: string;
  bounding_box: BoundingBox;
  confidence: number;
  image_url?: string;
  cropped_base64?: string;
}

const CHEQUE_DETECTION_PROMPT = `You are an expert OCR system analyzing scanned Israeli bank cheques.

CRITICAL INSTRUCTIONS:
1. Images may be ROTATED (90°, 180°, 270°) - mentally rotate to read correctly
2. Amounts are in NIS - typical values range from 500-50,000
3. NEVER confuse comma separators with decimal points
   - "1,800" = one thousand eight hundred (1800)
   - "18,007" would be unusual - verify carefully
4. Cheque numbers are usually 6-8 digits without commas

For each cheque extract:
- CHEQUE NUMBER (מספר שיק / رقم الشيك): 6-8 digit number
- DATE (תאריך / التاريخ): payment due date
- AMOUNT (סכום / المبلغ): monetary value in NIS (be careful with thousands separator)
- BANK NAME (if visible)
- ACCOUNT NUMBER (if visible)
- BRANCH NUMBER (if visible)

DATE HANDLING:
- Convert to YYYY-MM-DD format
- Israeli dates: DD/MM/YY or DD/MM/YYYY
- If year is 2 digits (e.g., 26), assume 2026

AMOUNT HANDLING - CRITICAL:
- Amounts use comma as THOUSANDS separator (e.g., 1,800 = 1800)
- Common amounts: 500, 800, 1000, 1200, 1400, 1500, 1800, 2000, 2500, 3000
- If you see something like 18,007 - double check, it's likely 1,800

BOUNDING BOX:
- x: percentage from left edge (0 = leftmost)
- y: percentage from top edge (0 = topmost)
- width: percentage of total image width
- height: percentage of total image height

CRITICAL: Return ONLY valid JSON, no markdown, no explanation.

Output format (strict JSON):
{
  "cheques": [
    {
      "cheque_number": "80001254",
      "payment_date": "2026-03-25",
      "amount": 1800,
      "bank_name": "דיסקונט",
      "account_number": "",
      "branch_number": "",
      "bounding_box": {"x": 0, "y": 0, "width": 100, "height": 100},
      "confidence": 95
    }
  ]
}

If no cheques are found, return: {"cheques": []}`;

async function cropImageWithCanvas(
  base64Image: string,
  boundingBox: BoundingBox
): Promise<string> {
  // For Deno, we'll return cropping instructions and let the client handle actual cropping
  // Or we could use a library, but for simplicity, we'll skip server-side cropping
  // and return the full image with bounding box info for client-side cropping
  return base64Image;
}

async function uploadToBunny(
  base64Data: string,
  fileName: string
): Promise<string | null> {
  const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
  const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "ab-insurance";
  const BUNNY_CDN_URL = Deno.env.get("BUNNY_CDN_URL") || "https://cdn.basheer-ab.com";
  
  if (!BUNNY_API_KEY) {
    console.error("BUNNY_API_KEY not configured");
    return null;
  }

  try {
    // Decode base64 to binary
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const uploadPath = `cheques/${fileName}`;
    const response = await fetch(
      `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${uploadPath}`,
      {
        method: "PUT",
        headers: {
          "AccessKey": BUNNY_API_KEY,
          "Content-Type": "image/jpeg",
        },
        body: binaryData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Bunny upload error:", errorText);
      return null;
    }

    return `${BUNNY_CDN_URL}/${uploadPath}`;
  } catch (error) {
    console.error("Error uploading to Bunny:", error);
    return null;
  }
}

function parseAIResponse(content: string): DetectedCheque[] {
  try {
    // Remove markdown code blocks if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);
    
    if (!parsed.cheques || !Array.isArray(parsed.cheques)) {
      console.error("Invalid AI response structure:", parsed);
      return [];
    }

    return parsed.cheques.map((cheque: any) => ({
      cheque_number: String(cheque.cheque_number || ""),
      payment_date: cheque.payment_date || "",
      amount: parseFloat(cheque.amount) || 0,
      bank_name: cheque.bank_name || "",
      account_number: cheque.account_number || "",
      branch_number: cheque.branch_number || "",
      bounding_box: {
        x: parseFloat(cheque.bounding_box?.x) || 0,
        y: parseFloat(cheque.bounding_box?.y) || 0,
        width: parseFloat(cheque.bounding_box?.width) || 100,
        height: parseFloat(cheque.bounding_box?.height) || 100,
      },
      confidence: parseFloat(cheque.confidence) || 0,
    }));
  } catch (error) {
    console.error("Error parsing AI response:", error, "Content:", content);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { images } = await req.json();
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${images.length} image(s) for cheque detection in PARALLEL`);

    // Process all images in parallel for speed
    const imageResults = await Promise.all(
      images.map(async (rawImage, imgIndex) => {
        let imageBase64 = rawImage;
        
        // Remove data URL prefix if present
        if (imageBase64.startsWith("data:")) {
          imageBase64 = imageBase64.split(",")[1];
        }

        console.log(`[Parallel] Starting image ${imgIndex + 1}/${images.length}...`);

        try {
          // Call Gemini Vision API with faster model
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: CHEQUE_DETECTION_PROMPT },
                    { 
                      type: "image_url", 
                      image_url: { 
                        url: `data:image/jpeg;base64,${imageBase64}` 
                      } 
                    }
                  ]
                }
              ]
            }),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error(`[Parallel] AI API error for image ${imgIndex + 1}:`, aiResponse.status, errorText);
            
            // Return error info instead of throwing - let other images continue
            return { 
              imgIndex, 
              imageBase64, 
              cheques: [], 
              error: aiResponse.status === 429 ? "rate_limit" : aiResponse.status === 402 ? "payment_required" : "api_error" 
            };
          }

          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;

          if (!content) {
            console.error(`[Parallel] No content in AI response for image ${imgIndex + 1}`);
            return { imgIndex, imageBase64, cheques: [], error: null };
          }

          console.log(`[Parallel] AI response for image ${imgIndex + 1}:`, content.substring(0, 300));

          const detectedCheques = parseAIResponse(content);
          console.log(`[Parallel] Found ${detectedCheques.length} cheques in image ${imgIndex + 1}`);

          return { imgIndex, imageBase64, cheques: detectedCheques, error: null };
        } catch (err) {
          console.error(`[Parallel] Error processing image ${imgIndex + 1}:`, err);
          return { imgIndex, imageBase64, cheques: [], error: "exception" };
        }
      })
    );

    // Check for critical errors (rate limit or payment required)
    const rateLimitError = imageResults.find(r => r.error === "rate_limit");
    if (rateLimitError) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const paymentError = imageResults.find(r => r.error === "payment_required");
    if (paymentError) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aggregate all detected cheques
    const allDetectedCheques: DetectedCheque[] = [];
    
    for (const result of imageResults) {
      for (let chequeIndex = 0; chequeIndex < result.cheques.length; chequeIndex++) {
        const cheque = result.cheques[chequeIndex];
        
        // Generate unique filename
        const timestamp = Date.now();
        const fileName = `cheque_${cheque.cheque_number || timestamp}_${result.imgIndex}_${chequeIndex}.jpg`;
        
        // Upload to CDN
        const cdnUrl = await uploadToBunny(result.imageBase64, fileName);
        
        if (cdnUrl) {
          cheque.image_url = cdnUrl;
        } else {
          cheque.image_url = `data:image/jpeg;base64,${result.imageBase64}`;
        }
        
        cheque.cropped_base64 = result.imageBase64;
        allDetectedCheques.push(cheque);
      }
    }

    console.log(`Total cheques detected: ${allDetectedCheques.length}`);

    // Sort cheques by payment date (ascending)
    allDetectedCheques.sort((a, b) => {
      const dateA = new Date(a.payment_date);
      const dateB = new Date(b.payment_date);
      return dateA.getTime() - dateB.getTime();
    });

    console.log("Cheques sorted by date");

    return new Response(
      JSON.stringify({ 
        success: true, 
        cheques: allDetectedCheques,
        total: allDetectedCheques.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in process-cheque-scan:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
