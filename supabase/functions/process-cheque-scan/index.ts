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

// Improved prompt with chain-of-thought reasoning for accurate bounding boxes
const CHEQUE_DETECTION_PROMPT = `You are an expert OCR system analyzing scanned Israeli bank cheques.

CRITICAL TASK: Detect ALL cheques in this image and provide PRECISE bounding boxes.

## STEP-BY-STEP PROCESS:

### STEP 1: IMAGE ROTATION CHECK
First, determine if the image is rotated:
- Check if text appears sideways or upside down
- If rotated, mentally rotate it to read correctly before proceeding
- Note the rotation angle (0°, 90°, 180°, 270°)

### STEP 2: COUNT ALL CHEQUES
- Scan the entire image from top to bottom
- Count how many distinct cheque rectangles are visible
- Cheques are usually rectangular with printed borders

### STEP 3: FOR EACH CHEQUE - MEASURE BOUNDING BOX PRECISELY
Think step by step:
1. Find the TOP-LEFT corner of the cheque rectangle
2. Find the BOTTOM-RIGHT corner of the cheque rectangle
3. Calculate as PERCENTAGES of the full image:
   - x = (left_edge_distance / total_image_width) × 100
   - y = (top_edge_distance / total_image_height) × 100
   - width = (cheque_width / total_image_width) × 100
   - height = (cheque_height / total_image_height) × 100

### BOUNDING BOX REFERENCE GUIDE:
- SINGLE cheque filling page: x=0, y=0, width=100, height=100
- 2 cheques stacked (top/bottom): 
  - Top: x=2, y=2, width=96, height=46
  - Bottom: x=2, y=52, width=96, height=46
- 3 cheques stacked:
  - Top: x=2, y=1, width=96, height=31
  - Middle: x=2, y=34, width=96, height=31
  - Bottom: x=2, y=67, width=96, height=31
- 4 cheques stacked:
  - Each has height ~24% with ~1% gap between them

### STEP 4: EXTRACT CHEQUE DATA
For each cheque extract:
- CHEQUE NUMBER (מספר שיק): Usually 6-8 digits at bottom
- DATE (תאריך): Payment due date - convert to YYYY-MM-DD
- AMOUNT (סכום): In NIS - IMPORTANT: commas are THOUSANDS separators!
  - "1,800" = 1800 (one thousand eight hundred)
  - "18,500" = 18500 (eighteen thousand five hundred)
- BANK NAME, ACCOUNT NUMBER, BRANCH NUMBER (if visible)

### DATE HANDLING:
- Israeli format: DD/MM/YY or DD/MM/YYYY
- If year is 2 digits (e.g., 26), assume 2026
- Convert ALL dates to YYYY-MM-DD format

### AMOUNT HANDLING - CRITICAL:
- Comma (,) is THOUSANDS separator, NOT decimal
- Period (.) would be decimal (rare in Israeli cheques)
- Common amounts: 500, 800, 1000, 1200, 1500, 1800, 2000, 2500, 3000, 5000

### OUTPUT FORMAT (strict JSON only, no markdown):
{
  "image_rotation": 0,
  "total_cheques_found": 2,
  "cheques": [
    {
      "cheque_number": "80001254",
      "payment_date": "2026-03-25",
      "amount": 1800,
      "bank_name": "דיסקונט",
      "account_number": "",
      "branch_number": "",
      "bounding_box": {"x": 2, "y": 2, "width": 96, "height": 46},
      "confidence": 95
    },
    {
      "cheque_number": "80001255",
      "payment_date": "2026-04-25",
      "amount": 1800,
      "bank_name": "דיסקונט",
      "account_number": "",
      "branch_number": "",
      "bounding_box": {"x": 2, "y": 52, "width": 96, "height": 46},
      "confidence": 95
    }
  ]
}

If no cheques are found, return: {"image_rotation": 0, "total_cheques_found": 0, "cheques": []}

RETURN ONLY VALID JSON. No markdown code blocks. No explanations.`;

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
    // Clean base64 data
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    
    // Decode base64 to binary
    const binaryData = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));
    
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

function parseAIResponse(content: string): { cheques: DetectedCheque[]; rotation: number } {
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
      return { cheques: [], rotation: 0 };
    }

    const rotation = parseInt(parsed.image_rotation) || 0;

    const cheques = parsed.cheques.map((cheque: any) => {
      // Validate and clamp bounding box values
      const bb = cheque.bounding_box || {};
      const x = Math.max(0, Math.min(100, parseFloat(bb.x) || 0));
      const y = Math.max(0, Math.min(100, parseFloat(bb.y) || 0));
      const width = Math.max(5, Math.min(100 - x, parseFloat(bb.width) || 100));
      const height = Math.max(5, Math.min(100 - y, parseFloat(bb.height) || 100));

      return {
        cheque_number: String(cheque.cheque_number || ""),
        payment_date: cheque.payment_date || "",
        amount: parseFloat(cheque.amount) || 0,
        bank_name: cheque.bank_name || "",
        account_number: cheque.account_number || "",
        branch_number: cheque.branch_number || "",
        bounding_box: { x, y, width, height },
        confidence: parseFloat(cheque.confidence) || 0,
      };
    });

    return { cheques, rotation };
  } catch (error) {
    console.error("Error parsing AI response:", error, "Content:", content);
    return { cheques: [], rotation: 0 };
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

    console.log(`Processing ${images.length} image(s) for cheque detection with gemini-2.5-pro`);

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
          // Use gemini-2.5-pro for better accuracy with bounding boxes
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
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
            
            return { 
              imgIndex, 
              imageBase64, 
              cheques: [], 
              rotation: 0,
              error: aiResponse.status === 429 ? "rate_limit" : aiResponse.status === 402 ? "payment_required" : "api_error" 
            };
          }

          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;

          if (!content) {
            console.error(`[Parallel] No content in AI response for image ${imgIndex + 1}`);
            return { imgIndex, imageBase64, cheques: [], rotation: 0, error: null };
          }

          console.log(`[Parallel] AI response for image ${imgIndex + 1}:`, content.substring(0, 500));

          const { cheques, rotation } = parseAIResponse(content);
          console.log(`[Parallel] Found ${cheques.length} cheques in image ${imgIndex + 1}, rotation: ${rotation}°`);

          return { imgIndex, imageBase64, cheques, rotation, error: null };
        } catch (err) {
          console.error(`[Parallel] Error processing image ${imgIndex + 1}:`, err);
          return { imgIndex, imageBase64, cheques: [], rotation: 0, error: "exception" };
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
        
        // Store the original full image base64 for client-side cropping
        cheque.cropped_base64 = result.imageBase64;
        
        // Store the rotation detected for this image so client can rotate before cropping
        (cheque as any).rotation = result.rotation;
        
        // Upload full image to CDN (client will rotate and crop)
        const cdnUrl = await uploadToBunny(result.imageBase64, fileName);
        
        if (cdnUrl) {
          cheque.image_url = cdnUrl;
        } else {
          // Fallback to data URL if upload fails
          cheque.image_url = `data:image/jpeg;base64,${result.imageBase64}`;
        }
        
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
