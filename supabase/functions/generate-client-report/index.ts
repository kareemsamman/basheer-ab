import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClientReportRequest {
  client_id: string;
}

interface PolicyData {
  id: string;
  policy_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  cancelled: boolean | null;
  transferred: boolean | null;
  company: { name: string; name_ar: string | null } | null;
  car: { car_number: string } | null;
}

interface CarData {
  id: string;
  car_number: string;
  manufacturer_name: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  car_type: string | null;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
  HEALTH: 'تأمين صحي',
  LIFE: 'تأمين حياة',
  PROPERTY: 'تأمين ممتلكات',
  TRAVEL: 'تأمين سفر',
  BUSINESS: 'تأمين أعمال',
  OTHER: 'أخرى',
};

const carTypeLabels: Record<string, string> = {
  car: 'خصوصي',
  cargo: 'شحن',
  small: 'صغير',
  taxi: 'تاكسي',
  tjeradown4: 'تجاري (<4 طن)',
  tjeraup4: 'تجاري (>4 طن)',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bunnyApiKey = Deno.env.get("BUNNY_API_KEY")!;
    const bunnyStorageZone = Deno.env.get("BUNNY_STORAGE_ZONE")!;
    // Hardcoded CDN URL - same pattern as invoice generation
    const bunnyCdnUrl = "https://cdn.basheer-ab.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id }: ClientReportRequest = await req.json();

    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating report for client: ${client_id}`);

    // Fetch client data
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();

    if (clientError || !client) {
      console.error("Client fetch error:", clientError);
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch cars
    const { data: cars } = await supabase
      .from("cars")
      .select("id, car_number, manufacturer_name, model, year, color, car_type")
      .eq("client_id", client_id)
      .is("deleted_at", null);

    // Fetch policies
    const { data: policies } = await supabase
      .from("policies")
      .select(`
        id, policy_number, policy_type_parent, policy_type_child, start_date, end_date, 
        insurance_price, cancelled, transferred,
        company:insurance_companies(name, name_ar),
        car:cars(car_number)
      `)
      .eq("client_id", client_id)
      .is("deleted_at", null)
      .order("start_date", { ascending: false });

    // Calculate payment summary
    const policyIds = (policies || []).map((p: any) => p.id);
    let totalPaid = 0;
    let totalInsurance = (policies || []).reduce((sum: number, p: any) => sum + (p.insurance_price || 0), 0);

    if (policyIds.length > 0) {
      const { data: payments } = await supabase
        .from("policy_payments")
        .select("amount, refused")
        .in("policy_id", policyIds);

      totalPaid = (payments || [])
        .filter((p: any) => !p.refused)
        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    }

    const totalRemaining = Number(totalInsurance) - totalPaid;

    // Fetch wallet balance
    const { data: walletData } = await supabase
      .from("customer_wallet_transactions")
      .select("amount, transaction_type")
      .eq("client_id", client_id);

    const weOweCustomer = (walletData || [])
      .filter((t: any) => t.transaction_type === 'refund' || t.transaction_type === 'transfer_refund_owed')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    const customerOwesUs = (walletData || [])
      .filter((t: any) => t.transaction_type === 'transfer_adjustment_due')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    const walletBalance = weOweCustomer - customerOwesUs;

    // Fetch branch name
    let branchName = null;
    if (client.branch_id) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name_ar, name")
        .eq("id", client.branch_id)
        .single();
      branchName = branch?.name_ar || branch?.name || null;
    }

    // Generate HTML
    const html = generateReportHtml(
      client,
      cars || [],
      policies || [],
      { totalPaid, totalRemaining, totalInsurance },
      walletBalance,
      branchName
    );

    // Upload to Bunny CDN
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const timestamp = now.getTime();
    const fileName = `client_report_${client.id_number}_${timestamp}.html`;
    const storagePath = `uploads/${year}/${month}/${fileName}`;

    const uploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${storagePath}`;

    console.log(`Uploading report to: ${uploadUrl}`);

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "AccessKey": bunnyApiKey,
        "Content-Type": "text/html; charset=utf-8",
      },
      body: html,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Bunny upload error:", errorText);
      throw new Error(`Failed to upload to CDN: ${errorText}`);
    }

    const cdnUrl = `${bunnyCdnUrl}/${storagePath}`;
    console.log(`Report uploaded successfully: ${cdnUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: cdnUrl,
        client_name: client.full_name,
        phone_number: client.phone_number,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error generating report:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred while generating the report." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    calendar: "gregory",
  });
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-GB");
}

function getPolicyStatus(policy: PolicyData): { label: string; class: string } {
  if (policy.cancelled) return { label: "ملغاة", class: "status-cancelled" };
  if (policy.transferred) return { label: "محولة", class: "status-transferred" };
  const endDate = new Date(policy.end_date);
  const today = new Date();
  if (endDate < today) return { label: "منتهية", class: "status-expired" };
  return { label: "سارية", class: "status-active" };
}

function generateReportHtml(
  client: any,
  cars: any[],
  policies: any[],
  paymentSummary: { totalPaid: number; totalRemaining: number; totalInsurance: number },
  walletBalance: number,
  branchName: string | null
): string {
  const activePolicies = policies.filter(p => {
    const endDate = new Date(p.end_date);
    return !p.cancelled && !p.transferred && endDate >= new Date();
  });

  const carsHtml = cars.length > 0 ? cars.map((car, i) => `
    <tr class="${i % 2 === 0 ? '' : 'alt'}">
      <td><span class="car-plate">${car.car_number}</span></td>
      <td>${car.manufacturer_name || '-'}</td>
      <td>${car.model || '-'}</td>
      <td class="ltr">${car.year || '-'}</td>
      <td>${car.color || '-'}</td>
      <td>${carTypeLabels[car.car_type || ''] || car.car_type || '-'}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty">لا توجد سيارات مسجلة</td></tr>';

  const policiesHtml = policies.length > 0 ? policies.map((policy, i) => {
    const status = getPolicyStatus(policy);
    return `
    <tr class="${i % 2 === 0 ? '' : 'alt'}">
      <td class="type-cell">${policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent}</td>
      <td>${policy.company?.name_ar || policy.company?.name || '-'}</td>
      <td>${policy.car?.car_number ? `<span class="car-plate-sm">${policy.car.car_number}</span>` : '-'}</td>
      <td class="ltr">${formatDateShort(policy.start_date)}</td>
      <td class="ltr">${formatDateShort(policy.end_date)}</td>
      <td class="price">₪${policy.insurance_price.toLocaleString()}</td>
      <td><span class="status ${status.class}">${status.label}</span></td>
    </tr>
  `}).join('') : '<tr><td colspan="7" class="empty">لا توجد وثائق تأمين</td></tr>';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير التأمينات - ${client.full_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #f8fafc;
      min-height: 100vh;
      padding: 16px;
      direction: rtl;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%);
      color: white;
      padding: 24px 20px;
      text-align: center;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header p {
      font-size: 14px;
      opacity: 0.85;
    }
    
    .content { padding: 20px; }
    
    /* Client Card */
    .client-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .client-name {
      font-size: 22px;
      font-weight: 700;
      color: #1a365d;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .client-name::before {
      content: '👤';
      font-size: 24px;
    }
    .client-info {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    @media (max-width: 480px) {
      .client-info { grid-template-columns: 1fr; }
    }
    .info-item {
      background: white;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .info-label { font-size: 11px; color: #64748b; margin-bottom: 2px; }
    .info-value { font-size: 14px; font-weight: 600; color: #1e293b; }
    
    /* Summary Grid */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    @media (max-width: 600px) {
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .summary-card {
      padding: 16px 12px;
      border-radius: 10px;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    .summary-card.primary { background: #eff6ff; border-color: #bfdbfe; }
    .summary-card.success { background: #f0fdf4; border-color: #bbf7d0; }
    .summary-card.danger { background: #fef2f2; border-color: #fecaca; }
    .summary-card.warning { background: #fffbeb; border-color: #fde68a; }
    .summary-icon { font-size: 24px; margin-bottom: 6px; }
    .summary-label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
    .summary-value { font-size: 18px; font-weight: 700; }
    .summary-card.primary .summary-value { color: #1e40af; }
    .summary-card.success .summary-value { color: #16a34a; }
    .summary-card.danger .summary-value { color: #dc2626; }
    .summary-card.warning .summary-value { color: #d97706; }
    
    /* Section */
    .section { margin-bottom: 24px; }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #1a365d;
      padding: 10px 16px;
      background: #f1f5f9;
      border-radius: 8px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    /* Mobile-responsive table container */
    .table-container {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }
    table {
      width: 100%;
      min-width: 500px;
      border-collapse: collapse;
    }
    th {
      background: #1a365d;
      color: white;
      padding: 12px 10px;
      font-size: 12px;
      font-weight: 600;
      text-align: right;
      white-space: nowrap;
    }
    td {
      padding: 10px;
      font-size: 12px;
      border-bottom: 1px solid #e2e8f0;
      background: white;
    }
    tr.alt td { background: #f8fafc; }
    tr:last-child td { border-bottom: none; }
    
    /* Car plate styling */
    .car-plate, .car-plate-sm {
      display: inline-block;
      background: linear-gradient(135deg, #fef08a 0%, #fde047 100%);
      border: 2px solid #1e293b;
      padding: 3px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-weight: 700;
      font-size: 12px;
      white-space: nowrap;
    }
    .car-plate-sm { padding: 2px 6px; font-size: 10px; }
    
    /* Status badges */
    .status {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
    }
    .status-active { background: #dcfce7; color: #16a34a; }
    .status-expired { background: #f3f4f6; color: #6b7280; }
    .status-cancelled { background: #fee2e2; color: #dc2626; }
    .status-transferred { background: #fef3c7; color: #d97706; }
    
    .price { font-weight: 700; color: #1a365d; white-space: nowrap; }
    .type-cell { font-weight: 600; }
    .empty { text-align: center; color: #94a3b8; padding: 24px !important; }
    .ltr { direction: ltr; text-align: center; }
    
    /* Footer */
      border-top: 2px solid #e2e8f0;
      text-align: center;
      color: #64748b;
      font-size: 12px;
    }
    .footer-brand { margin-bottom: 8px; }
    .footer-brand-ar { font-size: 18px; font-weight: 700; color: #1a365d; }
    .footer-brand-en { font-size: 10px; color: #94a3b8; letter-spacing: 2px; }
    .footer-date { font-size: 11px; color: #94a3b8; }
    
    /* Active policies highlight */
    .active-summary {
      background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
      border: 2px solid #10b981;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: center;
    }
    .active-count {
      font-size: 36px;
      font-weight: 700;
      color: #059669;
    }
    .active-label { font-size: 14px; color: #047857; margin-top: 4px; }

    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>بشير للتأمينات</h1>
      <p>تقرير تأميناتك الشامل</p>
    </div>
    
    <div class="content">
      <div class="client-card">
        <div class="client-name">${client.full_name}</div>
        <div class="client-info">
          <div class="info-item">
            <div class="info-label">رقم الهوية</div>
            <div class="info-value ltr">${client.id_number}</div>
          </div>
          <div class="info-item">
            <div class="info-label">رقم الهاتف</div>
            <div class="info-value ltr">${client.phone_number || '-'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">رقم الملف</div>
            <div class="info-value">${client.file_number || '-'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">تاريخ الانضمام</div>
            <div class="info-value">${formatDate(client.date_joined)}</div>
          </div>
          ${branchName ? `
          <div class="info-item">
            <div class="info-label">الفرع</div>
            <div class="info-value">${branchName}</div>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="active-summary">
        <div class="active-count">${activePolicies.length}</div>
        <div class="active-label">وثائق تأمين سارية</div>
      </div>

      <div class="summary-grid">
        <div class="summary-card primary">
          <div class="summary-icon">📋</div>
          <div class="summary-label">إجمالي التأمينات</div>
          <div class="summary-value">₪${paymentSummary.totalInsurance.toLocaleString()}</div>
        </div>
        <div class="summary-card success">
          <div class="summary-icon">✅</div>
          <div class="summary-label">المدفوع</div>
          <div class="summary-value">₪${paymentSummary.totalPaid.toLocaleString()}</div>
        </div>
        <div class="summary-card ${paymentSummary.totalRemaining > 0 ? 'danger' : 'success'}">
          <div class="summary-icon">${paymentSummary.totalRemaining > 0 ? '⚠️' : '✅'}</div>
          <div class="summary-label">المتبقي</div>
          <div class="summary-value">₪${paymentSummary.totalRemaining.toLocaleString()}</div>
        </div>
        ${walletBalance > 0 ? `
        <div class="summary-card warning">
          <div class="summary-icon">💰</div>
          <div class="summary-label">رصيد لك</div>
          <div class="summary-value">₪${walletBalance.toLocaleString()}</div>
        </div>
        ` : ''}
      </div>

      <div class="section">
        <div class="section-title">🚗 السيارات (${cars.length})</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>رقم السيارة</th>
                <th>الشركة</th>
                <th>الموديل</th>
                <th>السنة</th>
                <th>اللون</th>
                <th>النوع</th>
              </tr>
            </thead>
            <tbody>
              ${carsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📄 وثائق التأمين (${policies.length})</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>نوع التأمين</th>
                <th>الشركة</th>
                <th>السيارة</th>
                <th>من</th>
                <th>إلى</th>
                <th>السعر</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${policiesHtml}
            </tbody>
          </table>
        </div>
      </div>

      <div class="footer">
        <div class="footer-brand">
          <div class="footer-brand-ar">بشير للتأمينات</div>
          <div class="footer-brand-en">BASHEER INSURANCE</div>
        </div>
        <div class="footer-date">${formatDate(new Date().toISOString())}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
