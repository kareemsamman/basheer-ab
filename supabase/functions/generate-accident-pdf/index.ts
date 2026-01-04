import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  police_reported: boolean;
  police_station: string | null;
  police_report_number: string | null;
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
  vehicle_number: string | null;
  vehicle_manufacturer: string | null;
  vehicle_model: string | null;
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
    const bunnyStorageKey = Deno.env.get("BUNNY_STORAGE_KEY");
    const bunnyStorageZone = Deno.env.get("BUNNY_STORAGE_ZONE") || "ab-insurance";
    const bunnyCdnUrl = Deno.env.get("BUNNY_CDN_URL") || "https://ab-insurance.b-cdn.net";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { accident_report_id } = await req.json();

    if (!accident_report_id) {
      throw new Error("accident_report_id is required");
    }

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

    // Fetch company template if exists
    let templateMapping: Record<string, any> = {};
    if (report.company_id) {
      const { data: template } = await supabase
        .from("company_accident_templates")
        .select("mapping_json, template_pdf_url")
        .eq("company_id", report.company_id)
        .eq("is_active", true)
        .maybeSingle();

      if (template) {
        templateMapping = template.mapping_json || {};
      }
    }

    // Generate HTML content for PDF
    const htmlContent = generateHtmlReport(report as AccidentReport, thirdParties || []);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `accident-reports/${report.id}/${timestamp}.html`;

    // Upload to Bunny Storage if configured
    let pdfUrl = "";
    if (bunnyStorageKey) {
      const uploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${filename}`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "AccessKey": bunnyStorageKey,
          "Content-Type": "text/html; charset=utf-8",
        },
        body: htmlContent,
      });

      if (!uploadResponse.ok) {
        console.error("Bunny upload failed:", await uploadResponse.text());
        throw new Error("Failed to upload PDF to storage");
      }

      pdfUrl = `${bunnyCdnUrl}/${filename}`;
    } else {
      // Fallback: store as data URL (not recommended for production)
      pdfUrl = `data:text/html;base64,${btoa(unescape(encodeURIComponent(htmlContent)))}`;
    }

    // Update accident report with PDF URL
    const { error: updateError } = await supabase
      .from("accident_reports")
      .update({ generated_pdf_url: pdfUrl })
      .eq("id", accident_report_id);

    if (updateError) {
      console.error("Failed to update report with PDF URL:", updateError);
    }

    // Also save to media_files
    if (bunnyStorageKey && pdfUrl.startsWith("http")) {
      await supabase.from("media_files").insert({
        original_name: `accident-report-${report.id}.html`,
        mime_type: "text/html",
        size: new TextEncoder().encode(htmlContent).length,
        cdn_url: pdfUrl,
        storage_path: filename,
        entity_type: "accident_report",
        entity_id: accident_report_id,
        branch_id: report.branch_id,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdf_url: pdfUrl,
        message: "PDF generated successfully" 
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

function generateHtmlReport(report: AccidentReport, thirdParties: ThirdParty[]): string {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  const policyTypeLabel = report.policies.policy_type_child === "THIRD" ? "طرف ثالث" : "شامل";
  const companyName = report.insurance_companies?.name_ar || report.insurance_companies?.name || "-";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>بلاغ حادث - ${report.clients.full_name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Tajawal', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
      padding: 20mm;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #2563eb;
    }
    
    .header h1 {
      font-size: 24px;
      color: #2563eb;
      margin-bottom: 10px;
    }
    
    .header p {
      color: #666;
    }
    
    .section {
      margin-bottom: 25px;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #2563eb;
      margin-bottom: 15px;
      padding-bottom: 5px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    
    .info-item {
      background: #f8fafc;
      padding: 10px 15px;
      border-radius: 8px;
    }
    
    .info-item label {
      display: block;
      font-size: 12px;
      color: #64748b;
      margin-bottom: 5px;
    }
    
    .info-item span {
      font-weight: 500;
      color: #1e293b;
    }
    
    .description-box {
      background: #f8fafc;
      padding: 15px;
      border-radius: 8px;
      white-space: pre-wrap;
    }
    
    .third-party-card {
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
    }
    
    .third-party-card h4 {
      font-size: 14px;
      color: #2563eb;
      margin-bottom: 10px;
    }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    
    .badge-blue {
      background: #dbeafe;
      color: #1d4ed8;
    }
    
    .badge-green {
      background: #dcfce7;
      color: #16a34a;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #64748b;
      font-size: 12px;
    }
    
    @media print {
      body {
        padding: 10mm;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚨 بلاغ حادث مروري</h1>
    <p>تاريخ الإنشاء: ${formatDate(new Date().toISOString())}</p>
  </div>
  
  <!-- Policy & Company Info -->
  <div class="section">
    <h2 class="section-title">بيانات الوثيقة والتأمين</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>رقم الوثيقة</label>
        <span>${report.policies.policy_number || "-"}</span>
      </div>
      <div class="info-item">
        <label>نوع الوثيقة</label>
        <span class="badge badge-blue">${policyTypeLabel}</span>
      </div>
      <div class="info-item">
        <label>شركة التأمين</label>
        <span>${companyName}</span>
      </div>
      <div class="info-item">
        <label>فترة التغطية</label>
        <span>${formatDate(report.policies.start_date)} - ${formatDate(report.policies.end_date)}</span>
      </div>
    </div>
  </div>
  
  <!-- Client & Car Info -->
  <div class="section">
    <h2 class="section-title">بيانات المؤمن له والمركبة</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>اسم المؤمن له</label>
        <span>${report.clients.full_name}</span>
      </div>
      <div class="info-item">
        <label>رقم الهوية</label>
        <span>${report.clients.id_number}</span>
      </div>
      <div class="info-item">
        <label>رقم الهاتف</label>
        <span>${report.clients.phone_number || "-"}</span>
      </div>
      <div class="info-item">
        <label>رقم السيارة</label>
        <span>${report.cars?.car_number || "-"}</span>
      </div>
      <div class="info-item">
        <label>نوع المركبة</label>
        <span>${[report.cars?.manufacturer_name, report.cars?.model, report.cars?.year].filter(Boolean).join(" ") || "-"}</span>
      </div>
      <div class="info-item">
        <label>اللون</label>
        <span>${report.cars?.color || "-"}</span>
      </div>
    </div>
  </div>
  
  <!-- Accident Details -->
  <div class="section">
    <h2 class="section-title">تفاصيل الحادث</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>تاريخ الحادث</label>
        <span>${formatDate(report.accident_date)}</span>
      </div>
      <div class="info-item">
        <label>وقت الحادث</label>
        <span>${report.accident_time || "-"}</span>
      </div>
      <div class="info-item" style="grid-column: span 2;">
        <label>موقع الحادث</label>
        <span>${report.accident_location || "-"}</span>
      </div>
    </div>
    ${report.accident_description ? `
    <div style="margin-top: 15px;">
      <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 5px;">وصف الحادث</label>
      <div class="description-box">${report.accident_description}</div>
    </div>
    ` : ""}
  </div>
  
  <!-- Driver Info -->
  <div class="section">
    <h2 class="section-title">بيانات السائق وقت الحادث</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>اسم السائق</label>
        <span>${report.driver_name || "-"}</span>
      </div>
      <div class="info-item">
        <label>رقم الهوية</label>
        <span>${report.driver_id_number || "-"}</span>
      </div>
      <div class="info-item">
        <label>رقم الهاتف</label>
        <span>${report.driver_phone || "-"}</span>
      </div>
      <div class="info-item">
        <label>رقم رخصة القيادة</label>
        <span>${report.driver_license_number || "-"}</span>
      </div>
    </div>
  </div>
  
  <!-- Police Report -->
  ${report.police_reported ? `
  <div class="section">
    <h2 class="section-title">بلاغ الشرطة</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>تم التبليغ للشرطة</label>
        <span class="badge badge-green">نعم</span>
      </div>
      <div class="info-item">
        <label>مخفر الشرطة</label>
        <span>${report.police_station || "-"}</span>
      </div>
      <div class="info-item">
        <label>رقم المحضر</label>
        <span>${report.police_report_number || "-"}</span>
      </div>
    </div>
  </div>
  ` : ""}
  
  <!-- Third Parties -->
  ${thirdParties.length > 0 ? `
  <div class="section">
    <h2 class="section-title">الأطراف الثالثة (${thirdParties.length})</h2>
    ${thirdParties.map((tp, i) => `
    <div class="third-party-card">
      <h4>الطرف الثالث #${i + 1}: ${tp.full_name}</h4>
      <div class="info-grid">
        <div class="info-item">
          <label>رقم الهوية</label>
          <span>${tp.id_number || "-"}</span>
        </div>
        <div class="info-item">
          <label>رقم الهاتف</label>
          <span>${tp.phone || "-"}</span>
        </div>
        <div class="info-item">
          <label>رقم السيارة</label>
          <span>${tp.vehicle_number || "-"}</span>
        </div>
        <div class="info-item">
          <label>نوع المركبة</label>
          <span>${[tp.vehicle_manufacturer, tp.vehicle_model].filter(Boolean).join(" ") || "-"}</span>
        </div>
        <div class="info-item">
          <label>شركة التأمين</label>
          <span>${tp.insurance_company || "-"}</span>
        </div>
        <div class="info-item">
          <label>رقم وثيقة التأمين</label>
          <span>${tp.insurance_policy_number || "-"}</span>
        </div>
      </div>
      ${tp.damage_description ? `
      <div style="margin-top: 10px;">
        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 5px;">وصف الأضرار</label>
        <div class="description-box">${tp.damage_description}</div>
      </div>
      ` : ""}
    </div>
    `).join("")}
  </div>
  ` : ""}
  
  <!-- Signatures -->
  <div class="section" style="margin-top: 50px;">
    <div style="display: flex; justify-content: space-between;">
      <div style="text-align: center; width: 30%;">
        <div style="border-top: 1px solid #333; padding-top: 10px;">
          توقيع المؤمن له
        </div>
      </div>
      <div style="text-align: center; width: 30%;">
        <div style="border-top: 1px solid #333; padding-top: 10px;">
          توقيع الوكيل
        </div>
      </div>
    </div>
  </div>
  
  <div class="footer">
    <p>تم إنشاء هذا البلاغ بواسطة نظام AB Insurance CRM</p>
    <p>Report ID: ${report.id}</p>
  </div>
</body>
</html>`;
}
