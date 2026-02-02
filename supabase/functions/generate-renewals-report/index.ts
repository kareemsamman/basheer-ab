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
    const bunnyCdnUrl = 'https://cdn.basheer-ab.com';

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

    // Fetch renewals data using service function - now grouped by client
    const { data: renewals, error: renewalsError } = await supabase.rpc('report_renewals_service', {
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

    // Generate HTML report - now with grouped data
    const monthName = new Date(`${month}-01`).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
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

interface ClientData {
  client_id: string;
  client_name: string;
  client_file_number: string | null;
  client_phone: string | null;
  policies_count: number;
  earliest_end_date: string;
  days_remaining: number;
  total_price: number;
  car_numbers: string[] | null;
  policy_types: string[] | null;
  renewal_status: string;
  renewal_notes: string | null;
}

function buildReportHtml(clients: ClientData[], monthName: string, generatedBy: string): string {
  // Use Gregorian calendar (ar-EG) instead of Hijri (ar-SA)
  const now = new Date().toLocaleDateString('ar-EG', { 
    year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  // Calculate totals
  const totalCustomers = clients.length;
  const totalPolicies = clients.reduce((sum, c) => sum + (c.policies_count || 0), 0);
  const notContacted = clients.filter(c => c.renewal_status === 'not_contacted').length;
  const smsSent = clients.filter(c => c.renewal_status === 'sms_sent').length;
  const called = clients.filter(c => c.renewal_status === 'called').length;
  const urgentCount = clients.filter(c => c.days_remaining <= 7).length;

  const rows = clients.map((c, index) => {
    const isUrgent = c.days_remaining <= 7;
    const isWarning = c.days_remaining > 7 && c.days_remaining <= 14;
    const rowClass = isUrgent ? 'urgent' : isWarning ? 'warning' : '';
    const carNumbersStr = c.car_numbers?.join(', ') || '-';
    const policyTypesStr = c.policy_types?.map(t => POLICY_TYPE_LABELS[t] || t).join(', ') || '-';
    
    return `
    <tr class="client-row ${rowClass}">
      <td class="row-num">${index + 1}</td>
      <td class="client-info">
        <div class="client-name">${c.client_name}</div>
        ${c.client_file_number ? `<div class="file-number">#${c.client_file_number}</div>` : ''}
      </td>
      <td dir="ltr" class="phone">${c.client_phone || '-'}</td>
      <td class="cars">${carNumbersStr}</td>
      <td class="policies-count">${c.policies_count} وثيقة</td>
      <td class="policy-types">${policyTypesStr}</td>
      <td class="end-date">${formatDate(c.earliest_end_date)}</td>
      <td class="days ${isUrgent ? 'urgent-text' : isWarning ? 'warning-text' : ''}">${c.days_remaining} يوم</td>
      <td class="price">₪${(c.total_price || 0).toLocaleString()}</td>
      <td class="status">${RENEWAL_STATUS_LABELS[c.renewal_status] || c.renewal_status}</td>
    </tr>`;
  }).join('');

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
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 { font-size: 32px; margin-bottom: 8px; font-weight: 700; }
    .header p { opacity: 0.9; font-size: 18px; }
    
    /* Summary Cards */
    .summary {
      display: flex;
      justify-content: center;
      gap: 20px;
      padding: 30px;
      background: linear-gradient(to bottom, #f1f5f9, #f8fafc);
      flex-wrap: wrap;
    }
    .summary-card {
      background: white;
      padding: 24px 32px;
      border-radius: 16px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      min-width: 160px;
      border: 1px solid #e2e8f0;
    }
    .summary-card .value { 
      font-size: 36px; 
      font-weight: 800; 
      color: #1e3a5f; 
      line-height: 1;
    }
    .summary-card .label { 
      font-size: 13px; 
      color: #64748b; 
      margin-top: 8px;
      font-weight: 500;
    }
    .summary-card.primary { border-color: #0f766e; }
    .summary-card.primary .value { color: #0f766e; }
    .summary-card.urgent { border-color: #dc2626; }
    .summary-card.urgent .value { color: #dc2626; }
    .summary-card.warning { border-color: #f59e0b; }
    .summary-card.warning .value { color: #f59e0b; }
    .summary-card.info { border-color: #3b82f6; }
    .summary-card.info .value { color: #3b82f6; }
    
    /* Table */
    .table-container { padding: 20px; overflow-x: auto; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      font-size: 13px;
    }
    th, td { 
      padding: 14px 12px; 
      text-align: right; 
      border-bottom: 1px solid #e2e8f0;
    }
    th { 
      background: #f8fafc; 
      font-weight: 600; 
      color: #475569;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Client Row Styles */
    .client-row {
      transition: background 0.2s;
    }
    .client-row:hover { background: #f8fafc; }
    .client-row.urgent {
      background: linear-gradient(to left, #fef2f2, white);
      border-right: 4px solid #dc2626;
    }
    .client-row.warning {
      background: linear-gradient(to left, #fffbeb, white);
      border-right: 4px solid #f59e0b;
    }
    
    /* Cell Styles */
    .row-num { 
      color: #94a3b8; 
      font-weight: 500;
      width: 40px;
    }
    .client-info { min-width: 150px; }
    .client-name { font-weight: 600; color: #1e293b; }
    .file-number { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .phone { 
      font-family: 'Consolas', monospace; 
      direction: ltr;
      text-align: left;
      color: #475569;
    }
    .cars { 
      font-family: 'Consolas', monospace; 
      direction: ltr;
      text-align: left;
      font-size: 12px;
      max-width: 150px;
      color: #0f766e;
    }
    .policies-count {
      font-weight: 600;
      color: #1e3a5f;
    }
    .policy-types {
      font-size: 11px;
      color: #64748b;
      max-width: 120px;
    }
    .end-date {
      font-family: 'Consolas', monospace;
      color: #475569;
    }
    .days {
      font-weight: 600;
      color: #475569;
    }
    .urgent-text { color: #dc2626 !important; }
    .warning-text { color: #f59e0b !important; }
    .price { 
      font-weight: 700; 
      color: #0f766e;
      font-family: 'Consolas', monospace;
    }
    .status {
      font-size: 11px;
      color: #64748b;
    }
    
    /* Footer */
    .footer {
      padding: 24px;
      text-align: center;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    .footer p { margin: 4px 0; }
    
    /* Print Styles */
    @media print {
      body { padding: 0; background: white; }
      .container { box-shadow: none; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .summary { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .client-row.urgent, .client-row.warning { 
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact; 
      }
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .header h1 { font-size: 24px; }
      .summary { gap: 12px; padding: 20px; }
      .summary-card { padding: 16px 20px; min-width: 120px; }
      .summary-card .value { font-size: 28px; }
      table { font-size: 11px; }
      th, td { padding: 10px 8px; }
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
      <div class="summary-card primary">
        <div class="value">${totalCustomers}</div>
        <div class="label">إجمالي بحاجة للتجديد</div>
      </div>
      <div class="summary-card">
        <div class="value">${totalPolicies}</div>
        <div class="label">إجمالي الوثائق</div>
      </div>
      <div class="summary-card urgent">
        <div class="value">${urgentCount}</div>
        <div class="label">عاجل (7 أيام)</div>
      </div>
      <div class="summary-card warning">
        <div class="value">${notContacted}</div>
        <div class="label">لم يتم التواصل</div>
      </div>
      <div class="summary-card info">
        <div class="value">${smsSent}</div>
        <div class="label">تم إرسال SMS</div>
      </div>
    </div>
    
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>العميل</th>
            <th>الهاتف</th>
            <th>السيارات</th>
            <th>الوثائق</th>
            <th>الأنواع</th>
            <th>أقرب انتهاء</th>
            <th>الأيام</th>
            <th>السعر</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="10" style="text-align:center;padding:40px;color:#64748b;">لا يوجد عملاء</td></tr>'}
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
