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

    console.log(`[generate-renewals-report] Generating detailed report for month: ${month}`);

    // Fetch detailed renewals data - individual policies per client
    const { data: policies, error: policiesError } = await supabase.rpc('report_renewals_service_detailed', {
      p_end_month: `${month}-01`,
      p_days_remaining: days_filter,
      p_policy_type: policy_type
    });

    if (policiesError) {
      console.error('[generate-renewals-report] Error fetching policies:', policiesError);
      throw policiesError;
    }

    console.log(`[generate-renewals-report] Found ${policies?.length || 0} policies`);

    // Group policies by client
    const clientsMap = new Map<string, {
      client_id: string;
      client_name: string;
      client_file_number: string | null;
      client_phone: string | null;
      policies: Array<{
        policy_id: string;
        car_number: string | null;
        policy_type_parent: string;
        company_name_ar: string | null;
        end_date: string;
        days_remaining: number;
        insurance_price: number;
        renewal_status: string;
      }>;
      earliest_end_date: string;
      min_days_remaining: number;
      total_price: number;
    }>();

    for (const policy of (policies || [])) {
      const clientId = policy.client_id;
      
      if (!clientsMap.has(clientId)) {
        clientsMap.set(clientId, {
          client_id: clientId,
          client_name: policy.client_name,
          client_file_number: policy.client_file_number,
          client_phone: policy.client_phone,
          policies: [],
          earliest_end_date: policy.end_date,
          min_days_remaining: policy.days_remaining,
          total_price: 0
        });
      }
      
      const client = clientsMap.get(clientId)!;
      client.policies.push({
        policy_id: policy.policy_id,
        car_number: policy.car_number,
        policy_type_parent: policy.policy_type_parent,
        company_name_ar: policy.company_name_ar,
        end_date: policy.end_date,
        days_remaining: policy.days_remaining,
        insurance_price: policy.insurance_price,
        renewal_status: policy.renewal_status
      });
      
      client.total_price += policy.insurance_price || 0;
      
      if (policy.days_remaining < client.min_days_remaining) {
        client.min_days_remaining = policy.days_remaining;
        client.earliest_end_date = policy.end_date;
      }
    }

    const clients = Array.from(clientsMap.values());
    console.log(`[generate-renewals-report] Grouped into ${clients.length} unique clients`);

    // Get user info for footer
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    // Generate HTML report with detailed policies
    const monthName = new Date(`${month}-01`).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
    const html = buildDetailedReportHtml(clients, policies?.length || 0, monthName, userProfile?.full_name || userProfile?.email || 'Unknown');

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

interface ClientWithPolicies {
  client_id: string;
  client_name: string;
  client_file_number: string | null;
  client_phone: string | null;
  policies: Array<{
    policy_id: string;
    car_number: string | null;
    policy_type_parent: string;
    company_name_ar: string | null;
    end_date: string;
    days_remaining: number;
    insurance_price: number;
    renewal_status: string;
  }>;
  earliest_end_date: string;
  min_days_remaining: number;
  total_price: number;
}

function buildDetailedReportHtml(clients: ClientWithPolicies[], totalPolicies: number, monthName: string, generatedBy: string): string {
  const now = new Date().toLocaleDateString('en-GB', { 
    year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit' 
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  // Calculate totals
  const totalCustomers = clients.length;
  const urgentCount = clients.filter(c => c.min_days_remaining <= 7).length;
  const warningCount = clients.filter(c => c.min_days_remaining > 7 && c.min_days_remaining <= 14).length;
  const totalPrice = clients.reduce((sum, c) => sum + (c.total_price || 0), 0);

  // Build unified table rows - client header rows + policy rows
  let policyCounter = 0;
  const tableRows = clients.map((client, clientIndex) => {
    const isUrgent = client.min_days_remaining <= 7;
    const isWarning = client.min_days_remaining > 7 && client.min_days_remaining <= 14;
    const urgentClass = isUrgent ? 'urgent' : isWarning ? 'warning' : 'normal';
    const daysLabel = client.min_days_remaining === 0 ? 'اليوم!' : 
                      client.min_days_remaining === 1 ? 'غداً!' : 
                      `${client.min_days_remaining} يوم`;
    
    // Client header row
    const clientRow = `
      <tr class="client-row ${urgentClass}">
        <td class="client-num">${clientIndex + 1}</td>
        <td colspan="4" class="client-info">
          <span class="client-name">${client.client_name}</span>
          ${client.client_phone ? `<span class="client-phone" dir="ltr">${client.client_phone}</span>` : ''}
          ${client.client_file_number ? `<span class="client-file">#${client.client_file_number}</span>` : ''}
        </td>
        <td class="client-days ${urgentClass}">${daysLabel}</td>
        <td class="client-count">${client.policies.length} وثيقة</td>
        <td class="client-total">₪${(client.total_price || 0).toLocaleString('en-US')}</td>
      </tr>`;
    
    // Policy rows under this client
    const policyRows = client.policies.map((policy) => {
      policyCounter++;
      const policyUrgent = policy.days_remaining <= 7;
      const policyWarning = policy.days_remaining > 7 && policy.days_remaining <= 14;
      const policyDaysClass = policyUrgent ? 'urgent' : policyWarning ? 'warning' : 'normal';
      const policyDaysLabel = policy.days_remaining === 0 ? 'اليوم!' : 
                              policy.days_remaining === 1 ? 'غداً!' : 
                              `${policy.days_remaining} يوم`;
      
      return `
        <tr class="policy-row">
          <td class="policy-num">${policyCounter}</td>
          <td class="policy-car"><span class="car-badge" dir="ltr">${policy.car_number || '-'}</span></td>
          <td class="policy-type"><span class="type-badge">${POLICY_TYPE_LABELS[policy.policy_type_parent] || policy.policy_type_parent}</span></td>
          <td class="policy-company">${policy.company_name_ar || '-'}</td>
          <td class="policy-date" dir="ltr">${formatDate(policy.end_date)}</td>
          <td class="policy-days ${policyDaysClass}"><span class="days-badge">${policyDaysLabel}</span></td>
          <td></td>
          <td class="policy-price">₪${(policy.insurance_price || 0).toLocaleString('en-US')}</td>
        </tr>`;
    }).join('');
    
    return clientRow + policyRows;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير التجديدات - ${monthName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #f0f2f5;
      color: #1e293b;
      line-height: 1.6;
      padding: 0;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    /* Header - Dark Blue */
    .report-header {
      background: linear-gradient(135deg, #1e2a4a 0%, #2d3a5c 50%, #1e2a4a 100%);
      color: white;
      padding: 40px 32px 32px;
      text-align: center;
    }
    .header-title h1 {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .header-subtitle {
      opacity: 0.8;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .header-month-badge {
      display: inline-block;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.25);
      padding: 8px 32px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 700;
    }

    /* Date + period bar */
    .date-bar {
      background: white;
      padding: 12px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
    }

    /* Summary Cards */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      padding: 24px 32px;
      background: white;
      border-bottom: 1px solid #e5e7eb;
    }
    .summary-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 20px 16px;
      text-align: center;
    }
    .summary-card .card-label {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .summary-card .card-value {
      font-size: 28px;
      font-weight: 800;
      color: #1e293b;
    }
    .summary-card .card-value.urgent { color: #dc2626; }
    .summary-card .card-value.warning { color: #f59e0b; }
    .summary-card .card-value.success { color: #059669; }
    .summary-card .card-value.teal { color: #0f766e; }

    /* Section Title */
    .section-title {
      padding: 20px 32px 12px;
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      text-align: right;
      background: white;
    }
    
    /* Main Table */
    .table-wrap {
      background: white;
      padding: 0 32px 24px;
    }
    .main-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    
    .main-table thead th {
      background: #1e2a4a;
      color: white;
      padding: 14px 12px;
      text-align: right;
      font-weight: 700;
      font-size: 12px;
      white-space: nowrap;
    }
    .main-table thead th:first-child { width: 45px; text-align: center; border-radius: 0 8px 0 0; }
    .main-table thead th:last-child { text-align: left; border-radius: 8px 0 0 0; }
    
    /* Client Row */
    .client-row {
      border-top: 2px solid #e5e7eb;
    }
    .client-row.urgent { background: #fef2f2; }
    .client-row.warning { background: #fffbeb; }
    .client-row.normal { background: #f0fdf4; }
    .client-row td {
      padding: 12px;
      font-weight: 700;
    }
    .client-row .client-num {
      text-align: center;
      font-size: 14px;
      color: #64748b;
    }
    .client-row .client-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .client-row .client-name {
      font-size: 15px;
      color: #1e293b;
    }
    .client-row .client-phone {
      color: #0f766e;
      font-size: 12px;
      font-family: 'Consolas', monospace;
    }
    .client-row .client-file {
      background: #f1f5f9;
      color: #64748b;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
    }
    .client-row .client-days {
      text-align: center;
      font-size: 13px;
    }
    .client-row .client-days.urgent { color: #dc2626; }
    .client-row .client-days.warning { color: #d97706; }
    .client-row .client-days.normal { color: #059669; }
    .client-row .client-count {
      text-align: center;
      color: #2563eb;
      font-size: 12px;
    }
    .client-row .client-total {
      text-align: left;
      color: #1e293b;
      font-size: 14px;
      font-weight: 700;
    }
    
    /* Policy Row */
    .policy-row td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      background: white;
    }
    .policy-row:nth-child(even) td { background: #fafbfc; }
    .policy-row .policy-num {
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
    .policy-row .car-badge {
      background: #0f766e;
      color: white;
      padding: 3px 10px;
      border-radius: 6px;
      font-family: 'Consolas', monospace;
      font-size: 12px;
      font-weight: 600;
      display: inline-block;
    }
    .policy-row .type-badge {
      background: #eff6ff;
      color: #2563eb;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .policy-row .policy-company { color: #475569; }
    .policy-row .policy-date {
      font-family: 'Consolas', monospace;
      color: #64748b;
      font-size: 12px;
    }
    .policy-row .policy-days { text-align: center; }
    .policy-row .days-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
    }
    .policy-row .policy-days.urgent .days-badge { background: #fee2e2; color: #dc2626; }
    .policy-row .policy-days.warning .days-badge { background: #fef3c7; color: #d97706; }
    .policy-row .policy-days.normal .days-badge { background: #d1fae5; color: #059669; }
    .policy-row .policy-price {
      text-align: left;
      font-weight: 600;
      color: #1e293b;
    }
    
    /* Footer */
    .report-footer {
      background: white;
      padding: 16px 32px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .report-footer p {
      color: #6b7280;
      font-size: 12px;
    }
    .report-footer strong { color: #374151; }
    
    /* Print */
    @media print {
      body { padding: 0; background: white; }
      .report-header, .client-row, .summary-cards .summary-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .main-table thead { display: table-header-group; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .client-row { page-break-inside: avoid; }
      .policy-row { page-break-inside: avoid; }
    }
    
    @media (max-width: 768px) {
      .report-header { padding: 24px 16px; }
      .header-title h1 { font-size: 22px; }
      .summary-cards { grid-template-columns: repeat(2, 1fr); padding: 16px; gap: 12px; }
      .table-wrap { padding: 0 12px 16px; }
      .main-table { font-size: 11px; }
      .main-table thead th, .main-table td { padding: 8px 6px; }
      .date-bar, .section-title { padding-left: 16px; padding-right: 16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="report-header">
      <div class="header-title">
        <h1>تقرير الوثائق المنتهية</h1>
        <p class="header-subtitle">بشير للتأمين - BASHEER INSURANCE</p>
      </div>
      <div class="header-month-badge">${monthName}</div>
    </div>
    
    <!-- Date Bar -->
    <div class="date-bar">
      <span>تاريخ التقرير: ${now}</span>
    </div>

    <!-- Summary Cards -->
    <div class="summary-cards">
      <div class="summary-card">
        <div class="card-label">عدد العملاء</div>
        <div class="card-value">${totalCustomers}</div>
      </div>
      <div class="summary-card">
        <div class="card-label">عدد الوثائق</div>
        <div class="card-value">${totalPolicies}</div>
      </div>
      <div class="summary-card">
        <div class="card-label">عاجل (≤7 أيام)</div>
        <div class="card-value urgent">${urgentCount}</div>
      </div>
      <div class="summary-card">
        <div class="card-label">إجمالي السعر</div>
        <div class="card-value teal">₪${totalPrice.toLocaleString('en-US')}</div>
      </div>
    </div>

    <!-- Section Title -->
    <div class="section-title">تفاصيل الوثائق (${totalPolicies} وثيقة)</div>
    
    <!-- Table -->
    <div class="table-wrap">
      <table class="main-table">
        <thead>
          <tr>
            <th>#</th>
            <th>رقم السيارة</th>
            <th>النوع</th>
            <th>الشركة</th>
            <th>تاريخ الانتهاء</th>
            <th>المتبقي</th>
            <th></th>
            <th>السعر</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="8" style="text-align:center;padding:40px;color:#64748b;">لا يوجد وثائق منتهية في هذه الفترة</td></tr>'}
        </tbody>
      </table>
    </div>
    
    <!-- Footer -->
    <div class="report-footer">
      <p>تم إنشاء التقرير: <strong>${now}</strong></p>
      <p>بواسطة: <strong>${generatedBy}</strong></p>
    </div>
  </div>
</body>
</html>`;
}
