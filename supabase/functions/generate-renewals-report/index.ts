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
  const notContacted = clients.filter(c => c.policies.some(p => p.renewal_status === 'not_contacted')).length;
  const smsSent = clients.filter(c => c.policies.some(p => p.renewal_status === 'sms_sent')).length;
  const called = clients.filter(c => c.policies.some(p => p.renewal_status === 'called')).length;
  const urgentCount = clients.filter(c => c.min_days_remaining <= 7).length;
  const totalPrice = clients.reduce((sum, c) => sum + (c.total_price || 0), 0);

  // Build client cards with nested policy tables
  const clientCards = clients.map((client, clientIndex) => {
    const isUrgent = client.min_days_remaining <= 7;
    const isWarning = client.min_days_remaining > 7 && client.min_days_remaining <= 14;
    const urgentClass = isUrgent ? 'urgent' : isWarning ? 'warning' : '';
    const daysLabel = client.min_days_remaining === 0 ? 'اليوم!' : 
                      client.min_days_remaining === 1 ? 'غداً!' : 
                      `${client.min_days_remaining} يوم`;
    
    // Policy rows inside client card
    const policyRows = client.policies.map((policy, pIdx) => {
      const policyUrgent = policy.days_remaining <= 7;
      const policyWarning = policy.days_remaining > 7 && policy.days_remaining <= 14;
      const policyDaysLabel = policy.days_remaining === 0 ? 'اليوم!' : 
                              policy.days_remaining === 1 ? 'غداً!' : 
                              `${policy.days_remaining} يوم`;
      
      return `
        <tr class="policy-row ${pIdx % 2 === 0 ? 'even' : 'odd'}">
          <td class="car-cell">
            <span class="car-number">${policy.car_number || '-'}</span>
          </td>
          <td class="type-cell">
            <span class="type-badge">${POLICY_TYPE_LABELS[policy.policy_type_parent] || policy.policy_type_parent}</span>
          </td>
          <td class="company-cell">${policy.company_name_ar || '-'}</td>
          <td class="date-cell">${formatDate(policy.end_date)}</td>
          <td class="days-cell ${policyUrgent ? 'urgent-days' : policyWarning ? 'warning-days' : 'normal-days'}">
            <span class="days-badge">${policyDaysLabel}</span>
          </td>
          <td class="price-cell">₪${(policy.insurance_price || 0).toLocaleString('en-US')}</td>
        </tr>`;
    }).join('');

    return `
    <div class="client-card ${urgentClass}">
      <div class="client-header">
        <div class="client-main">
          <div class="client-number">${clientIndex + 1}</div>
          <div class="client-details">
            <div class="client-name">${client.client_name}</div>
            <div class="client-meta">
              ${client.client_file_number ? `<span class="file-badge">#${client.client_file_number}</span>` : ''}
              ${client.client_phone ? `<span class="phone-badge" dir="ltr">${client.client_phone}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="client-summary">
          <div class="summary-item policies">
            <span class="summary-value">${client.policies.length}</span>
            <span class="summary-label">وثيقة</span>
          </div>
          <div class="summary-item days ${urgentClass}">
            <span class="summary-value">${daysLabel}</span>
            <span class="summary-label">أقرب انتهاء</span>
          </div>
          <div class="summary-item price">
            <span class="summary-value">₪${(client.total_price || 0).toLocaleString('en-US')}</span>
            <span class="summary-label">إجمالي</span>
          </div>
        </div>
      </div>
      <table class="policies-table">
        <thead>
          <tr>
            <th>رقم السيارة</th>
            <th>النوع</th>
            <th>الشركة</th>
            <th>تاريخ الانتهاء</th>
            <th>الأيام المتبقية</th>
            <th>السعر</th>
          </tr>
        </thead>
        <tbody>
          ${policyRows}
        </tbody>
      </table>
    </div>`;
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
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%);
      color: #1e293b;
      line-height: 1.6;
      padding: 24px;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1100px;
      margin: 0 auto;
    }
    
    /* Header */
    .report-header {
      background: linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%);
      color: white;
      padding: 40px 32px;
      border-radius: 20px;
      margin-bottom: 24px;
      box-shadow: 0 10px 40px rgba(15, 118, 110, 0.3);
      position: relative;
      overflow: hidden;
    }
    .report-header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 300px;
      height: 300px;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
    }
    .report-header::after {
      content: '';
      position: absolute;
      bottom: -30%;
      left: -10%;
      width: 200px;
      height: 200px;
      background: rgba(255,255,255,0.08);
      border-radius: 50%;
    }
    .header-content {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }
    .header-title h1 {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 4px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header-title p {
      opacity: 0.9;
      font-size: 18px;
    }
    .header-stats {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .header-stat {
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(10px);
      padding: 16px 24px;
      border-radius: 12px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .header-stat .stat-value {
      font-size: 28px;
      font-weight: 800;
      display: block;
    }
    .header-stat .stat-label {
      font-size: 12px;
      opacity: 0.9;
    }
    
    /* Summary Cards Row */
    .summary-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: white;
      padding: 20px 24px;
      border-radius: 16px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .summary-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(0,0,0,0.1);
    }
    .summary-card .card-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .summary-card .card-value {
      font-size: 28px;
      font-weight: 800;
      color: #1e293b;
    }
    .summary-card .card-label {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .summary-card.primary .card-icon { background: #d1fae5; }
    .summary-card.primary .card-value { color: #0f766e; }
    .summary-card.urgent .card-icon { background: #fee2e2; }
    .summary-card.urgent .card-value { color: #dc2626; }
    .summary-card.warning .card-icon { background: #fef3c7; }
    .summary-card.warning .card-value { color: #d97706; }
    .summary-card.info .card-icon { background: #dbeafe; }
    .summary-card.info .card-value { color: #2563eb; }
    .summary-card.total .card-icon { background: #f0fdf4; }
    .summary-card.total .card-value { color: #16a34a; }
    
    /* Client Cards */
    .clients-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .client-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      overflow: hidden;
      border: 1px solid #e2e8f0;
      transition: box-shadow 0.2s;
    }
    .client-card:hover {
      box-shadow: 0 8px 30px rgba(0,0,0,0.1);
    }
    .client-card.urgent {
      border-right: 5px solid #dc2626;
      background: linear-gradient(to left, #fef2f2 0%, white 100%);
    }
    .client-card.warning {
      border-right: 5px solid #f59e0b;
      background: linear-gradient(to left, #fffbeb 0%, white 100%);
    }
    
    .client-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #f1f5f9;
      flex-wrap: wrap;
      gap: 16px;
    }
    
    .client-main {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .client-number {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #0f766e, #14b8a6);
      color: white;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16px;
      flex-shrink: 0;
    }
    .client-card.urgent .client-number {
      background: linear-gradient(135deg, #dc2626, #ef4444);
    }
    .client-card.warning .client-number {
      background: linear-gradient(135deg, #d97706, #f59e0b);
    }
    
    .client-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .client-name {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
    }
    
    .client-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    
    .file-badge {
      background: #f1f5f9;
      color: #64748b;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .phone-badge {
      background: #ecfdf5;
      color: #0f766e;
      padding: 2px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Consolas', 'Monaco', monospace;
    }
    
    .client-summary {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    
    .summary-item {
      text-align: center;
      min-width: 80px;
    }
    .summary-item .summary-value {
      font-size: 18px;
      font-weight: 800;
      display: block;
      color: #1e293b;
    }
    .summary-item .summary-label {
      font-size: 11px;
      color: #94a3b8;
    }
    .summary-item.policies .summary-value { color: #2563eb; }
    .summary-item.days.urgent .summary-value { color: #dc2626; }
    .summary-item.days.warning .summary-value { color: #d97706; }
    .summary-item.price .summary-value { color: #0f766e; }
    
    /* Policies Table */
    .policies-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .policies-table th {
      background: #f8fafc;
      padding: 12px 16px;
      text-align: right;
      font-weight: 600;
      color: #64748b;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e2e8f0;
    }
    .policies-table td {
      padding: 14px 16px;
      border-bottom: 1px solid #f1f5f9;
    }
    .policy-row.even { background: #fafafa; }
    .policy-row.odd { background: white; }
    .policy-row:last-child td { border-bottom: none; }
    
    .car-cell .car-number {
      background: linear-gradient(135deg, #0f766e, #14b8a6);
      color: white;
      padding: 4px 12px;
      border-radius: 8px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-weight: 600;
      font-size: 13px;
      display: inline-block;
      direction: ltr;
    }
    
    .type-badge {
      background: #eff6ff;
      color: #2563eb;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .company-cell {
      color: #475569;
      font-size: 13px;
    }
    
    .date-cell {
      font-family: 'Consolas', 'Monaco', monospace;
      color: #475569;
      font-size: 13px;
      direction: ltr;
      text-align: left;
    }
    
    .days-cell .days-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 12px;
      display: inline-block;
    }
    .urgent-days .days-badge {
      background: #fee2e2;
      color: #dc2626;
    }
    .warning-days .days-badge {
      background: #fef3c7;
      color: #d97706;
    }
    .normal-days .days-badge {
      background: #d1fae5;
      color: #0f766e;
    }
    
    .price-cell {
      font-weight: 700;
      color: #0f766e;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 14px;
      direction: ltr;
      text-align: left;
    }
    
    /* Footer */
    .report-footer {
      margin-top: 32px;
      padding: 24px;
      background: white;
      border-radius: 16px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.04);
      border: 1px solid #e2e8f0;
    }
    .report-footer p {
      color: #64748b;
      font-size: 13px;
      margin: 4px 0;
    }
    .report-footer .generated-at {
      font-weight: 600;
      color: #475569;
    }
    
    /* Print Styles */
    @media print {
      body {
        padding: 0;
        background: white;
      }
      .container {
        max-width: 100%;
      }
      .report-header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .summary-card {
        break-inside: avoid;
      }
      .client-card {
        break-inside: avoid;
        page-break-inside: avoid;
        box-shadow: none;
        border: 1px solid #ddd;
      }
      .client-card.urgent,
      .client-card.warning {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      body { padding: 12px; }
      .report-header { padding: 24px 20px; }
      .header-title h1 { font-size: 24px; }
      .header-stats { gap: 10px; }
      .header-stat { padding: 12px 16px; }
      .header-stat .stat-value { font-size: 22px; }
      .summary-row { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .summary-card { padding: 16px; }
      .summary-card .card-value { font-size: 22px; }
      .client-header { padding: 16px; }
      .client-name { font-size: 16px; }
      .policies-table th, .policies-table td { padding: 10px 8px; font-size: 11px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="report-header">
      <div class="header-content">
        <div class="header-title">
          <h1>📋 تقرير الوثائق المنتهية</h1>
          <p>${monthName}</p>
        </div>
        <div class="header-stats">
          <div class="header-stat">
            <span class="stat-value">${totalCustomers}</span>
            <span class="stat-label">عميل</span>
          </div>
          <div class="header-stat">
            <span class="stat-value">${totalPolicies}</span>
            <span class="stat-label">وثيقة</span>
          </div>
          <div class="header-stat">
            <span class="stat-value">₪${totalPrice.toLocaleString('en-US')}</span>
            <span class="stat-label">إجمالي القيمة</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Summary Cards -->
    <div class="summary-row">
      <div class="summary-card urgent">
        <div class="card-icon">🔴</div>
        <div class="card-value">${urgentCount}</div>
        <div class="card-label">عاجل (7 أيام أو أقل)</div>
      </div>
      <div class="summary-card warning">
        <div class="card-icon">🟡</div>
        <div class="card-value">${clients.filter(c => c.min_days_remaining > 7 && c.min_days_remaining <= 14).length}</div>
        <div class="card-label">تحذير (8-14 يوم)</div>
      </div>
      <div class="summary-card info">
        <div class="card-icon">📞</div>
        <div class="card-value">${notContacted}</div>
        <div class="card-label">لم يتم التواصل</div>
      </div>
      <div class="summary-card primary">
        <div class="card-icon">📱</div>
        <div class="card-value">${smsSent}</div>
        <div class="card-label">تم إرسال SMS</div>
      </div>
    </div>
    
    <!-- Clients List -->
    <div class="clients-list">
      ${clientCards || '<div style="text-align:center;padding:60px;color:#64748b;background:white;border-radius:16px;">لا يوجد وثائق منتهية في هذه الفترة</div>'}
    </div>
    
    <!-- Footer -->
    <div class="report-footer">
      <p class="generated-at">تم إنشاء التقرير: ${now}</p>
      <p>بواسطة: ${generatedBy}</p>
    </div>
  </div>
</body>
</html>`;
}
