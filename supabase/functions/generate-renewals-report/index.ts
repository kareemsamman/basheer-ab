import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateReportRequest {
  month: string;
  days_filter?: number | null;
  policy_type?: string | null;
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
};

const RENEWAL_STATUS_LABELS: Record<string, string> = {
  not_contacted: 'لم يتم التواصل',
  sms_sent: 'تم إرسال SMS',
  called: 'تم الاتصال',
  renewed: 'تم التجديد',
  not_interested: 'غير مهتم',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bunnyApiKey = Deno.env.get("BUNNY_API_KEY");
    const bunnyStorageZone = Deno.env.get("BUNNY_STORAGE_ZONE");
    const bunnyCdnUrl = 'https://basheer-ab.b-cdn.net';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { month, days_filter, policy_type }: GenerateReportRequest = await req.json();

    if (!month) {
      return new Response(
        JSON.stringify({ error: "month is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-renewals-report] Generating report for month: ${month}`);

    // Fetch renewals data
    const { data: renewals, error: renewalsError } = await supabase.rpc('report_renewals', {
      p_end_month: `${month}-01`,
      p_days_remaining: days_filter,
      p_policy_type: policy_type,
      p_limit: 1000,
      p_offset: 0
    });

    if (renewalsError) {
      console.error('[generate-renewals-report] Error fetching renewals:', renewalsError);
      throw renewalsError;
    }

    // Get user info for footer
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    // Generate HTML report
    const monthName = new Date(`${month}-01`).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
    const html = buildReportHtml(renewals || [], monthName, userProfile?.full_name || userProfile?.email || 'Unknown');

    if (!bunnyApiKey || !bunnyStorageZone) {
      return new Response(
        JSON.stringify({ error: 'Storage not configured' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload to Bunny Storage
    const now = new Date();
    const year = now.getFullYear();
    const monthNum = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    const storagePath = `reports/${year}/${monthNum}/renewals_report_${month}_${timestamp}_${randomId}.html`;
    const bunnyUploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${storagePath}`;

    const uploadResponse = await fetch(bunnyUploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': bunnyApiKey,
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: html,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload report: ${uploadResponse.status}`);
    }

    const reportUrl = `${bunnyCdnUrl}/${storagePath}`;
    console.log(`[generate-renewals-report] Report generated: ${reportUrl}`);

    return new Response(
      JSON.stringify({ success: true, url: reportUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[generate-renewals-report] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildReportHtml(renewals: any[], monthName: string, generatedBy: string): string {
  const now = new Date().toLocaleDateString('ar-SA', { 
    year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const rows = renewals.map((r, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${formatDate(r.end_date)}</td>
      <td class="${r.days_remaining <= 7 ? 'urgent' : r.days_remaining <= 14 ? 'warning' : ''}">${r.days_remaining} يوم</td>
      <td>${r.client_name || '-'}</td>
      <td>${r.client_file_number || '-'}</td>
      <td dir="ltr">${r.client_phone || '-'}</td>
      <td>${r.car_number || '-'}</td>
      <td>${POLICY_TYPE_LABELS[r.policy_type_parent] || r.policy_type_parent}</td>
      <td>${r.company_name_ar || r.company_name || '-'}</td>
      <td class="price">₪${(r.insurance_price || 0).toLocaleString()}</td>
      <td>${RENEWAL_STATUS_LABELS[r.renewal_status] || r.renewal_status}</td>
      <td>${r.renewal_notes || ''}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير التجديدات - ${monthName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.6;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header p { opacity: 0.9; font-size: 16px; }
    .summary {
      display: flex;
      justify-content: center;
      gap: 20px;
      padding: 20px;
      background: #f1f5f9;
      flex-wrap: wrap;
    }
    .summary-card {
      background: white;
      padding: 15px 25px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .summary-card .value { font-size: 24px; font-weight: bold; color: #1e3a5f; }
    .summary-card .label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .table-container { padding: 20px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 12px 10px; text-align: right; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    tr:hover { background: #f1f5f9; }
    .urgent { color: #dc2626; font-weight: bold; }
    .warning { color: #f59e0b; font-weight: bold; }
    .price { font-weight: bold; color: #0f766e; }
    .footer {
      padding: 20px;
      text-align: center;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    @media print {
      body { padding: 0; background: white; }
      .container { box-shadow: none; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media (max-width: 768px) {
      .header h1 { font-size: 22px; }
      table { font-size: 11px; }
      th, td { padding: 8px 6px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>تقرير الوثائق المنتهية</h1>
      <p>${monthName}</p>
    </div>
    
    <div class="summary">
      <div class="summary-card">
        <div class="value">${renewals.length}</div>
        <div class="label">إجمالي الوثائق</div>
      </div>
      <div class="summary-card">
        <div class="value">${renewals.filter(r => r.days_remaining <= 7).length}</div>
        <div class="label">تنتهي خلال 7 أيام</div>
      </div>
      <div class="summary-card">
        <div class="value">${renewals.filter(r => r.renewal_status === 'not_contacted').length}</div>
        <div class="label">لم يتم التواصل</div>
      </div>
    </div>
    
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>تاريخ الانتهاء</th>
            <th>الأيام المتبقية</th>
            <th>العميل</th>
            <th>رقم الملف</th>
            <th>الهاتف</th>
            <th>السيارة</th>
            <th>النوع</th>
            <th>الشركة</th>
            <th>السعر</th>
            <th>الحالة</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="12" style="text-align:center;padding:40px;color:#64748b;">لا توجد وثائق</td></tr>'}
        </tbody>
      </table>
    </div>
    
    <div class="footer">
      <p>تم إنشاء التقرير: ${now}</p>
      <p>بواسطة: ${generatedBy}</p>
    </div>
  </div>
</body>
</html>`;
}
