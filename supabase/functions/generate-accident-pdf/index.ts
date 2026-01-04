import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// IMPORTANT: must match the scale used when rendering the PDF inside the Accident Template Mapper UI
// (see src/pages/AccidentTemplateMapper.tsx -> page.getViewport({ scale: 1.5 }))
const MAPPER_RENDER_SCALE = 1.5;

interface FieldMapping {
  page: number;
  x: number;
  y: number;
  size: number;
  type: "text" | "checkbox" | "freetext";
  freeTextValue?: string;
}

interface MappingJson {
  [fieldId: string]: FieldMapping;
}

interface AccidentReport {
  id: string;
  policy_id: string;
  accident_date: string;
  accident_time: string | null;
  accident_location: string | null;
  accident_description: string | null;
  driver_name: string | null;
  driver_id_number: string | null;
  driver_phone: string | null;
  driver_license_number: string | null;
  driver_address: string | null;
  driver_age: number | null;
  driver_occupation: string | null;
  license_issue_place: string | null;
  license_expiry_date: string | null;
  first_license_date: string | null;
  police_reported: boolean;
  police_station: string | null;
  police_report_number: string | null;
  owner_address: string | null;
  vehicle_license_expiry: string | null;
  passengers_count: number | null;
  vehicle_usage_purpose: string | null;
  own_car_damages: string | null;
  was_anyone_injured: boolean | null;
  injuries_description: string | null;
  witnesses_info: string | null;
  passengers_info: string | null;
  responsible_party: string | null;
  additional_details: string | null;
  company_id: string | null;
  branch_id: string | null;
  clients: {
    full_name: string;
    id_number: string;
    phone_number: string | null;
  };
  cars: {
    car_number: string;
    manufacturer_name: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
  } | null;
  policies: {
    policy_number: string | null;
    policy_type_child: string | null;
    start_date: string;
    end_date: string;
  };
  insurance_companies: {
    name: string;
    name_ar: string | null;
  } | null;
}

interface ThirdParty {
  full_name: string;
  id_number: string | null;
  phone: string | null;
  address: string | null;
  vehicle_number: string | null;
  vehicle_manufacturer: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_type: string | null;
  insurance_company: string | null;
  insurance_policy_number: string | null;
  damage_description: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bunnyStorageKey = Deno.env.get("BUNNY_API_KEY");
    const bunnyStorageZone = Deno.env.get("BUNNY_STORAGE_ZONE") || "basheer-ab";
    const bunnyCdnUrl = "https://basheer-ab.b-cdn.net";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { accident_report_id } = await req.json();

    if (!accident_report_id) {
      throw new Error("accident_report_id is required");
    }

    console.log("Generating PDF for accident report:", accident_report_id);

    // Fetch accident report with related data
    const { data: report, error: reportError } = await supabase
      .from("accident_reports")
      .select(`
        *,
        clients!inner(full_name, id_number, phone_number),
        cars(car_number, manufacturer_name, model, year, color),
        policies!inner(policy_number, policy_type_child, start_date, end_date),
        insurance_companies(name, name_ar)
      `)
      .eq("id", accident_report_id)
      .single();

    if (reportError || !report) {
      throw new Error(`Failed to fetch accident report: ${reportError?.message}`);
    }

    // Fetch third parties
    const { data: thirdParties } = await supabase
      .from("accident_third_parties")
      .select("*")
      .eq("accident_report_id", accident_report_id)
      .order("sort_order");

    // Check if company has a template
    let pdfBytes: Uint8Array | null = null;
    let usedTemplate = false;

    if (report.company_id) {
      const { data: template } = await supabase
        .from("company_accident_templates")
        .select("template_pdf_url, mapping_json, is_active")
        .eq("company_id", report.company_id)
        .eq("is_active", true)
        .single();

      if (template?.template_pdf_url && template?.mapping_json) {
        console.log("Found company template, generating filled PDF");
        
        try {
          // Fetch the template PDF
          const pdfResponse = await fetch(template.template_pdf_url);
          if (!pdfResponse.ok) {
            throw new Error("Failed to fetch template PDF");
          }
          const templatePdfBytes = await pdfResponse.arrayBuffer();
          
          // Load the PDF
          const pdfDoc = await PDFDocument.load(templatePdfBytes);
          const pages = pdfDoc.getPages();
          
          // Get mapping data
          const mapping = template.mapping_json as MappingJson;
          
          // Build field values from report data
          const fieldValues = buildFieldValues(report as AccidentReport, thirdParties || []);
          
          console.log("Mapping fields:", Object.keys(mapping).length);
          
          // Apply each mapped field to the PDF
          for (const [fieldId, fieldConfig] of Object.entries(mapping)) {
            const pageIndex = fieldConfig.page || 0;
            if (pageIndex >= pages.length) continue;
            
            const page = pages[pageIndex];
            const { width, height } = page.getSize();
            
            let textValue = "";
            if (fieldConfig.type === "freetext") {
              textValue = fieldConfig.freeTextValue || "";
            } else {
              textValue = fieldValues[fieldId] || "";
            }
            
            if (!textValue) continue;
            
            // Convert coordinates from mapper (top-left origin in a rendered image) to PDF points (bottom-left origin).
            // Mapper stores pixel coordinates from a PDF.js render at MAPPER_RENDER_SCALE.
            // So we must divide by that scale to get PDF points.
            const maybeNeedsScale = fieldConfig.x > width + 1 || fieldConfig.y > height + 1;
            const scale = maybeNeedsScale ? MAPPER_RENDER_SCALE : 1;

            const pdfX = fieldConfig.x / scale;
            const pdfY = height - fieldConfig.y / scale - (fieldConfig.size || 12);

            try {
              page.drawText(textValue, {
                x: pdfX,
                y: pdfY,
                size: fieldConfig.size || 12,
                color: rgb(0, 0, 0),
              });
            } catch (drawError) {
              console.warn(`Failed to draw field ${fieldId}:`, drawError);
            }
          }
          
          pdfBytes = await pdfDoc.save();
          usedTemplate = true;
          console.log("Successfully generated filled PDF");
          
        } catch (templateError) {
          console.error("Error using template, falling back to HTML:", templateError);
        }
      }
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let filename: string;
    let contentType: string;
    let fileContent: Uint8Array | string;
    
    if (pdfBytes && usedTemplate) {
      filename = `accident-reports/${report.id}/${timestamp}.pdf`;
      contentType = "application/pdf";
      fileContent = pdfBytes;
    } else {
      // Fallback to HTML report
      console.log("Using HTML fallback report");
      filename = `accident-reports/${report.id}/${timestamp}.html`;
      contentType = "text/html; charset=utf-8";
      fileContent = generateHtmlReport(report as AccidentReport, thirdParties || []);
    }

    // Upload to Bunny Storage
    let pdfUrl = "";
    if (bunnyStorageKey) {
      const uploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${filename}`;
      
      // Convert to appropriate body type
      const body: BodyInit = typeof fileContent === 'string' 
        ? fileContent 
        : fileContent.buffer as ArrayBuffer;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "AccessKey": bunnyStorageKey,
          "Content-Type": contentType,
        },
        body: body,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Bunny upload failed:", errorText);
        throw new Error("Failed to upload PDF to storage");
      }

      pdfUrl = `${bunnyCdnUrl}/${filename}`;
      console.log("Generated PDF URL:", pdfUrl);
    } else {
      console.warn("No BUNNY_API_KEY configured");
      throw new Error("Storage not configured");
    }

    // Update accident report with PDF URL
    const { error: updateError } = await supabase
      .from("accident_reports")
      .update({ generated_pdf_url: pdfUrl })
      .eq("id", accident_report_id);

    if (updateError) {
      console.error("Failed to update report with PDF URL:", updateError);
    }

    // Save to media_files
    await supabase.from("media_files").insert({
      original_name: `accident-report-${report.id}.${usedTemplate ? 'pdf' : 'html'}`,
      mime_type: usedTemplate ? "application/pdf" : "text/html",
      size: typeof fileContent === 'string' ? new TextEncoder().encode(fileContent).length : fileContent.length,
      cdn_url: pdfUrl,
      storage_path: filename,
      entity_type: "accident_report",
      entity_id: accident_report_id,
      branch_id: report.branch_id,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdf_url: pdfUrl,
        used_template: usedTemplate,
        message: usedTemplate ? "PDF generated from template" : "HTML report generated" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating accident PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildFieldValues(report: AccidentReport, thirdParties: ThirdParty[]): Record<string, string> {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  const policyTypeLabel = report.policies.policy_type_child === "THIRD" ? "طرف ثالث" : "شامل";
  const companyName = report.insurance_companies?.name_ar || report.insurance_companies?.name || "";

  const values: Record<string, string> = {
    // Policy & Insurance
    policy_number: report.policies.policy_number || "",
    policy_type: policyTypeLabel,
    policy_start_date: formatDate(report.policies.start_date),
    policy_end_date: formatDate(report.policies.end_date),
    company_name: companyName,
    
    // Owner (Client) Info
    owner_name: report.clients.full_name || "",
    owner_id_number: report.clients.id_number || "",
    owner_phone: report.clients.phone_number || "",
    owner_address: report.owner_address || "",
    
    // Vehicle Info
    car_number: report.cars?.car_number || "",
    car_chassis: "", // Not in current schema
    car_manufacturer: report.cars?.manufacturer_name || "",
    car_model: report.cars?.model || "",
    car_year: report.cars?.year?.toString() || "",
    car_color: report.cars?.color || "",
    car_usage: report.vehicle_usage_purpose || "",
    vehicle_license_expiry: formatDate(report.vehicle_license_expiry),
    
    // Accident Details
    accident_date: formatDate(report.accident_date),
    accident_time: report.accident_time || "",
    accident_location: report.accident_location || "",
    accident_description: report.accident_description || "",
    vehicle_usage_purpose: report.vehicle_usage_purpose || "",
    passengers_count: report.passengers_count?.toString() || "",
    responsible_party: report.responsible_party || "",
    
    // Driver Info
    driver_name: report.driver_name || "",
    driver_address: report.driver_address || "",
    driver_id_number: report.driver_id_number || "",
    driver_phone: report.driver_phone || "",
    driver_age: report.driver_age?.toString() || "",
    driver_occupation: report.driver_occupation || "",
    driver_license_number: report.driver_license_number || "",
    license_issue_place: report.license_issue_place || "",
    license_expiry_date: formatDate(report.license_expiry_date),
    first_license_date: formatDate(report.first_license_date),
    
    // Damages
    own_car_damages: report.own_car_damages || "",
    was_anyone_injured: report.was_anyone_injured ? "نعم" : "لا",
    injuries_description: report.injuries_description || "",
    
    // Police
    police_reported: report.police_reported ? "نعم" : "لا",
    police_station: report.police_station || "",
    police_report_number: report.police_report_number || "",
    
    // Witnesses & Passengers
    witnesses_info: report.witnesses_info || "",
    passengers_info: report.passengers_info || "",
    additional_details: report.additional_details || "",
    
    // Report metadata
    report_date: formatDate(new Date().toISOString()),
  };
  
  // Add third party info
  if (thirdParties.length > 0) {
    const tp1 = thirdParties[0];
    values.third_party_1_name = tp1.full_name || "";
    values.third_party_1_id = tp1.id_number || "";
    values.third_party_1_phone = tp1.phone || "";
    values.third_party_1_car_number = tp1.vehicle_number || "";
    values.third_party_1_car_type = `${tp1.vehicle_manufacturer || ""} ${tp1.vehicle_model || ""} ${tp1.vehicle_year || ""}`.trim();
    values.third_party_1_insurance = tp1.insurance_company || "";
    values.third_party_1_policy = tp1.insurance_policy_number || "";
    values.third_party_1_damages = tp1.damage_description || "";
  }
  
  if (thirdParties.length > 1) {
    const tp2 = thirdParties[1];
    values.third_party_2_name = tp2.full_name || "";
    values.third_party_2_id = tp2.id_number || "";
    values.third_party_2_phone = tp2.phone || "";
    values.third_party_2_car_number = tp2.vehicle_number || "";
    values.third_party_2_car_type = `${tp2.vehicle_manufacturer || ""} ${tp2.vehicle_model || ""} ${tp2.vehicle_year || ""}`.trim();
    values.third_party_2_insurance = tp2.insurance_company || "";
  }
  
  return values;
}

function generateHtmlReport(report: AccidentReport, thirdParties: ThirdParty[]): string {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  const policyTypeLabel = report.policies.policy_type_child === "THIRD" ? "طرف ثالث" : "شامل";
  const companyName = report.insurance_companies?.name_ar || report.insurance_companies?.name || "-";

  let thirdPartiesHtml = "";
  if (thirdParties.length > 0) {
    thirdPartiesHtml = `
    <div class="section">
      <h2 class="section-title">بيانات الأطراف الأخرى</h2>
      ${thirdParties.map((tp, i) => `
        <div class="third-party-card">
          <h4>الطرف الثالث ${i + 1}: ${tp.full_name}</h4>
          <div class="info-grid">
            <div class="info-item"><label>رقم الهوية</label><span>${tp.id_number || "-"}</span></div>
            <div class="info-item"><label>الهاتف</label><span>${tp.phone || "-"}</span></div>
            <div class="info-item"><label>رقم السيارة</label><span>${tp.vehicle_number || "-"}</span></div>
            <div class="info-item"><label>نوع السيارة</label><span>${tp.vehicle_manufacturer || ""} ${tp.vehicle_model || ""} ${tp.vehicle_year || ""}</span></div>
            <div class="info-item"><label>شركة التأمين</label><span>${tp.insurance_company || "-"}</span></div>
            <div class="info-item"><label>رقم الوثيقة</label><span>${tp.insurance_policy_number || "-"}</span></div>
            <div class="info-item full-width"><label>وصف الأضرار</label><span>${tp.damage_description || "-"}</span></div>
          </div>
        </div>
      `).join("")}
    </div>`;
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>بلاغ حادث - ${report.clients.full_name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Tajawal', sans-serif; font-size: 13px; line-height: 1.5; color: #1a1a1a; background: #fff; padding: 15mm; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #2563eb; }
    .header h1 { font-size: 22px; color: #2563eb; margin-bottom: 8px; }
    .header .company-name { font-size: 16px; font-weight: 600; color: #333; }
    .header p { color: #666; font-size: 12px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 15px; font-weight: 700; color: #2563eb; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .info-item { background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
    .info-item.full-width { grid-column: span 2; }
    .info-item label { display: block; font-size: 11px; color: #64748b; margin-bottom: 3px; }
    .info-item span { font-weight: 500; color: #1e293b; font-size: 13px; }
    .third-party-card { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .third-party-card h4 { font-size: 13px; color: #2563eb; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px dashed #cbd5e1; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 15px; font-size: 11px; font-weight: 500; background: #dbeafe; color: #1d4ed8; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; text-align: center; color: #64748b; font-size: 11px; }
    @media print { body { padding: 10mm; font-size: 12px; } .section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚨 بلاغ حادث مروري</h1>
    <p class="company-name">${companyName}</p>
    <p>تاريخ الإنشاء: ${formatDate(new Date().toISOString())}</p>
  </div>
  
  <div class="section">
    <h2 class="section-title">بيانات الوثيقة والتأمين</h2>
    <div class="info-grid">
      <div class="info-item"><label>رقم الوثيقة</label><span>${report.policies.policy_number || "-"}</span></div>
      <div class="info-item"><label>نوع الوثيقة</label><span class="badge">${policyTypeLabel}</span></div>
      <div class="info-item"><label>شركة التأمين</label><span>${companyName}</span></div>
      <div class="info-item"><label>مدة التأمين</label><span>من ${formatDate(report.policies.start_date)} إلى ${formatDate(report.policies.end_date)}</span></div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">بيانات صاحب السيارة (المؤمن له)</h2>
    <div class="info-grid">
      <div class="info-item"><label>اسم صاحب السيارة</label><span>${report.clients.full_name}</span></div>
      <div class="info-item"><label>رقم الهوية</label><span>${report.clients.id_number}</span></div>
      <div class="info-item"><label>رقم الهاتف</label><span>${report.clients.phone_number || "-"}</span></div>
      <div class="info-item"><label>العنوان</label><span>${report.owner_address || "-"}</span></div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">بيانات المركبة</h2>
    <div class="info-grid">
      <div class="info-item"><label>رقم المركبة</label><span>${report.cars?.car_number || "-"}</span></div>
      <div class="info-item"><label>الصنع / المصنّع</label><span>${report.cars?.manufacturer_name || "-"}</span></div>
      <div class="info-item"><label>النوع / الموديل</label><span>${report.cars?.model || "-"}</span></div>
      <div class="info-item"><label>سنة الصنع</label><span>${report.cars?.year || "-"}</span></div>
      <div class="info-item"><label>اللون</label><span>${report.cars?.color || "-"}</span></div>
      <div class="info-item"><label>استعمال السيارة</label><span>${report.vehicle_usage_purpose || "-"}</span></div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">بيانات السائق وقت الحادث</h2>
    <div class="info-grid">
      <div class="info-item"><label>اسم السائق</label><span>${report.driver_name || "-"}</span></div>
      <div class="info-item"><label>عنوان السائق</label><span>${report.driver_address || "-"}</span></div>
      <div class="info-item"><label>رقم الهوية</label><span>${report.driver_id_number || "-"}</span></div>
      <div class="info-item"><label>رقم الهاتف</label><span>${report.driver_phone || "-"}</span></div>
      <div class="info-item"><label>العمر</label><span>${report.driver_age || "-"}</span></div>
      <div class="info-item"><label>المهنة</label><span>${report.driver_occupation || "-"}</span></div>
      <div class="info-item"><label>رقم الرخصة</label><span>${report.driver_license_number || "-"}</span></div>
      <div class="info-item"><label>مكان الإصدار</label><span>${report.license_issue_place || "-"}</span></div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">تفاصيل الحادث</h2>
    <div class="info-grid">
      <div class="info-item"><label>تاريخ الحادث</label><span>${formatDate(report.accident_date)}</span></div>
      <div class="info-item"><label>ساعة الحادث</label><span>${report.accident_time || "-"}</span></div>
      <div class="info-item full-width"><label>مكان الحادث</label><span>${report.accident_location || "-"}</span></div>
      <div class="info-item full-width"><label>كيف وقع الحادث</label><span>${report.accident_description || "-"}</span></div>
      <div class="info-item full-width"><label>الأضرار التي لحقت بسيارتك</label><span>${report.own_car_damages || "-"}</span></div>
    </div>
  </div>
  
  ${thirdPartiesHtml}
  
  <div class="footer">
    <p>تم إنشاء هذا التقرير آلياً بواسطة نظام AB Insurance CRM</p>
  </div>
</body>
</html>`;
}
