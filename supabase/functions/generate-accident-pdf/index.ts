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
  // New fields
  owner_address: string | null;
  driver_address: string | null;
  driver_age: number | null;
  driver_occupation: string | null;
  license_issue_place: string | null;
  license_expiry_date: string | null;
  first_license_date: string | null;
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
    const bunnyCdnUrl = Deno.env.get("BUNNY_CDN_URL") || "https://basheer-ab.b-cdn.net";

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
  const formatDate = (dateStr: string | null) => {
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
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
      padding: 15mm;
    }
    
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #2563eb;
    }
    
    .header h1 {
      font-size: 22px;
      color: #2563eb;
      margin-bottom: 8px;
    }
    
    .header .company-name {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
    
    .header p {
      color: #666;
      font-size: 12px;
    }
    
    .section {
      margin-bottom: 20px;
    }
    
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #2563eb;
      margin-bottom: 12px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    
    .info-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    
    .info-item {
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    
    .info-item.full-width {
      grid-column: span 2;
    }
    
    .info-item.full-width-3 {
      grid-column: span 3;
    }
    
    .info-item label {
      display: block;
      font-size: 11px;
      color: #64748b;
      margin-bottom: 3px;
    }
    
    .info-item span {
      font-weight: 500;
      color: #1e293b;
      font-size: 13px;
    }
    
    .description-box {
      background: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      white-space: pre-wrap;
      min-height: 60px;
    }
    
    .third-party-card {
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    .third-party-card h4 {
      font-size: 13px;
      color: #2563eb;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px dashed #cbd5e1;
    }
    
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 15px;
      font-size: 11px;
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
    
    .badge-red {
      background: #fee2e2;
      color: #dc2626;
    }
    
    .signatures {
      margin-top: 40px;
      display: flex;
      justify-content: space-around;
    }
    
    .signature-box {
      text-align: center;
      width: 28%;
    }
    
    .signature-line {
      border-top: 1px solid #333;
      padding-top: 8px;
      margin-top: 50px;
      font-size: 12px;
    }
    
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #64748b;
      font-size: 11px;
    }
    
    @media print {
      body {
        padding: 10mm;
        font-size: 12px;
      }
      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚨 بلاغ حادث مروري</h1>
    <p class="company-name">${companyName}</p>
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
        <label>مدة التأمين</label>
        <span>من ${formatDate(report.policies.start_date)} إلى ${formatDate(report.policies.end_date)}</span>
      </div>
    </div>
  </div>
  
  <!-- Owner (Client) Info -->
  <div class="section">
    <h2 class="section-title">بيانات صاحب السيارة (المؤمن له)</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>اسم صاحب السيارة</label>
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
        <label>العنوان</label>
        <span>${report.owner_address || "-"}</span>
      </div>
    </div>
  </div>
  
  <!-- Vehicle Info -->
  <div class="section">
    <h2 class="section-title">بيانات المركبة</h2>
    <div class="info-grid-3">
      <div class="info-item">
        <label>رقم المركبة</label>
        <span>${report.cars?.car_number || "-"}</span>
      </div>
      <div class="info-item">
        <label>الصنع / المصنّع</label>
        <span>${report.cars?.manufacturer_name || "-"}</span>
      </div>
      <div class="info-item">
        <label>النوع / الموديل</label>
        <span>${report.cars?.model || "-"}</span>
      </div>
      <div class="info-item">
        <label>سنة الصنع</label>
        <span>${report.cars?.year || "-"}</span>
      </div>
      <div class="info-item">
        <label>اللون</label>
        <span>${report.cars?.color || "-"}</span>
      </div>
      <div class="info-item">
        <label>استعمال السيارة</label>
        <span>${report.vehicle_usage_purpose || "-"}</span>
      </div>
      <div class="info-item">
        <label>تاريخ انتهاء رخصة المركبة</label>
        <span>${formatDate(report.vehicle_license_expiry)}</span>
      </div>
    </div>
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
        <label>عنوان السائق</label>
        <span>${report.driver_address || "-"}</span>
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
        <label>عمر السائق</label>
        <span>${report.driver_age || "-"}</span>
      </div>
      <div class="info-item">
        <label>مهنة السائق</label>
        <span>${report.driver_occupation || "-"}</span>
      </div>
    </div>
    
    <div style="margin-top: 10px;">
      <div class="info-grid">
        <div class="info-item">
          <label>رقم رخصة السائق</label>
          <span>${report.driver_license_number || "-"}</span>
        </div>
        <div class="info-item">
          <label>مكان صدور الرخصة</label>
          <span>${report.license_issue_place || "-"}</span>
        </div>
        <div class="info-item">
          <label>تاريخ انتهاء الرخصة</label>
          <span>${formatDate(report.license_expiry_date)}</span>
        </div>
        <div class="info-item">
          <label>تاريخ الحصول الأول على الرخصة</label>
          <span>${formatDate(report.first_license_date)}</span>
        </div>
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
        <label>ساعة الحادث</label>
        <span>${report.accident_time || "-"}</span>
      </div>
      <div class="info-item full-width">
        <label>مكان الحادث</label>
        <span>${report.accident_location || "-"}</span>
      </div>
      <div class="info-item">
        <label>عدد الركاب بالسيارة</label>
        <span>${report.passengers_count ?? "-"}</span>
      </div>
      <div class="info-item">
        <label>الغرض من استعمال السيارة</label>
        <span>${report.vehicle_usage_purpose || "-"}</span>
      </div>
    </div>
    
    <div style="margin-top: 12px;">
      <label style="display: block; font-size: 11px; color: #64748b; margin-bottom: 5px;">كيف وقع الحادث (بالتفصيل)</label>
      <div class="description-box">${report.accident_description || "-"}</div>
    </div>
    
    <div style="margin-top: 12px;">
      <div class="info-item">
        <label>من المسؤول عن الحادث (برأيك)</label>
        <span>${report.responsible_party || "-"}</span>
      </div>
    </div>
  </div>
  
  <!-- Police Report -->
  <div class="section">
    <h2 class="section-title">بلاغ الشرطة</h2>
    <div class="info-grid-3">
      <div class="info-item">
        <label>هل حققت الشرطة بالحادث</label>
        <span class="badge ${report.police_reported ? 'badge-green' : 'badge-red'}">${report.police_reported ? 'نعم' : 'لا'}</span>
      </div>
      ${report.police_reported ? `
      <div class="info-item">
        <label>مخفر الشرطة</label>
        <span>${report.police_station || "-"}</span>
      </div>
      <div class="info-item">
        <label>رقم المحضر</label>
        <span>${report.police_report_number || "-"}</span>
      </div>
      ` : ''}
    </div>
  </div>
  
  <!-- Damages -->
  <div class="section">
    <h2 class="section-title">الأضرار</h2>
    <div style="margin-bottom: 12px;">
      <label style="display: block; font-size: 11px; color: #64748b; margin-bottom: 5px;">الأضرار التي لحقت بسيارتك من جراء الحادث (بالتفصيل)</label>
      <div class="description-box">${report.own_car_damages || "-"}</div>
    </div>
  </div>
  
  <!-- Injuries -->
  <div class="section">
    <h2 class="section-title">الإصابات الشخصية</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>هل أصيب أحد من جراء الحادث</label>
        <span class="badge ${report.was_anyone_injured ? 'badge-red' : 'badge-green'}">${report.was_anyone_injured ? 'نعم' : 'لا'}</span>
      </div>
    </div>
    ${report.was_anyone_injured && report.injuries_description ? `
    <div style="margin-top: 12px;">
      <label style="display: block; font-size: 11px; color: #64748b; margin-bottom: 5px;">تفاصيل الإصابات</label>
      <div class="description-box">${report.injuries_description}</div>
    </div>
    ` : ''}
  </div>
  
  <!-- Third Parties -->
  ${thirdParties.length > 0 ? `
  <div class="section">
    <h2 class="section-title">بيانات الطرف الثالث (${thirdParties.length})</h2>
    ${thirdParties.map((tp, i) => `
    <div class="third-party-card">
      <h4>الطرف الثالث #${i + 1}: ${tp.full_name}</h4>
      <div class="info-grid">
        <div class="info-item">
          <label>اسم المالك وعنوانه</label>
          <span>${tp.full_name}${tp.address ? ' - ' + tp.address : ''}</span>
        </div>
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
          <label>نوع السيارة</label>
          <span>${[tp.vehicle_manufacturer, tp.vehicle_model, tp.vehicle_year].filter(Boolean).join(" ") || "-"}</span>
        </div>
        <div class="info-item">
          <label>لون السيارة</label>
          <span>${tp.vehicle_color || "-"}</span>
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
        <label style="display: block; font-size: 11px; color: #64748b; margin-bottom: 5px;">الأضرار التي لحقت بسيارة الطرف الثالث</label>
        <div class="description-box">${tp.damage_description}</div>
      </div>
      ` : ""}
    </div>
    `).join("")}
  </div>
  ` : ""}
  
  <!-- Witnesses & Passengers -->
  <div class="section">
    <h2 class="section-title">الشهود والركاب</h2>
    <div class="info-grid">
      <div class="info-item full-width">
        <label>أسماء الشهود وعناوينهم (اذكر إذا كان الشهود ركاباً أم لا)</label>
        <span>${report.witnesses_info || "-"}</span>
      </div>
      <div class="info-item full-width">
        <label>أسماء الركاب وعناوينهم</label>
        <span>${report.passengers_info || "-"}</span>
      </div>
    </div>
    ${report.additional_details ? `
    <div style="margin-top: 12px;">
      <label style="display: block; font-size: 11px; color: #64748b; margin-bottom: 5px;">تفاصيل إضافية</label>
      <div class="description-box">${report.additional_details}</div>
    </div>
    ` : ''}
  </div>
  
  <!-- Signatures -->
  <div class="signatures">
    <div class="signature-box">
      <div class="signature-line">توقيع المؤمن له / السائق</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">التاريخ</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">ملاحظات الموظف</div>
    </div>
  </div>
  
  <div class="footer">
    <p>تم إنشاء هذا البلاغ بواسطة نظام AB Insurance CRM</p>
    <p>Report ID: ${report.id}</p>
  </div>
</body>
</html>`;
}
