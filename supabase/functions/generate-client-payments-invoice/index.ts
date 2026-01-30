import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'نقدي',
  cheque: 'شيك',
  visa: 'بطاقة ائتمان',
  transfer: 'تحويل بنكي',
};

const POLICY_TYPE_LABELS: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
  THIRD: 'ثالث',
  FULL: 'شامل',
  HEALTH: 'تأمين صحي',
  LIFE: 'تأمين حياة',
  PROPERTY: 'تأمين ممتلكات',
  TRAVEL: 'تأمين سفر',
  BUSINESS: 'تأمين أعمال',
  OTHER: 'أخرى',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
  });
}

function buildComprehensiveInvoiceHtml(
  client: any,
  policies: any[],
  payments: any[],
  totals: { totalInsurance: number; totalPaid: number; totalRemaining: number }
): string {
  // Build payments table rows
  const paymentRows = payments.map(payment => {
    const paymentTypeLabel = PAYMENT_TYPE_LABELS[payment.payment_type] || payment.payment_type;
    const policyType = payment.policy?.policy_type_parent 
      ? (POLICY_TYPE_LABELS[payment.policy.policy_type_parent] || payment.policy.policy_type_parent)
      : '-';
    
    // Build payment details based on type
    let details = '-';
    if (payment.payment_type === 'visa') {
      const parts: string[] = [];
      if (payment.card_last_four) parts.push(`****${payment.card_last_four}`);
      if (payment.installments_count && payment.installments_count > 1) {
        parts.push(`${payment.installments_count} תשלומים`);
      }
      if (payment.tranzila_approval_code) parts.push(`אישור: ${payment.tranzila_approval_code}`);
      details = parts.join('<br>') || '-';
    } else if (payment.payment_type === 'cheque') {
      const parts: string[] = [];
      if (payment.cheque_number) parts.push(`رقم: ${payment.cheque_number}`);
      if (payment.cheque_date) parts.push(`تاريخ: ${formatDate(payment.cheque_date)}`);
      details = parts.join('<br>') || '-';
    }

    return `
      <tr>
        <td>${formatDate(payment.payment_date)}</td>
        <td class="amount">₪${(payment.amount || 0).toLocaleString()}</td>
        <td><span class="badge badge-${payment.payment_type}">${paymentTypeLabel}</span></td>
        <td class="details">${details}</td>
        <td>${policyType}</td>
        <td>${payment.refused ? '<span class="refused">راجع</span>' : '<span class="approved">مقبول</span>'}</td>
      </tr>
    `;
  }).join('');

  // Build policies summary
  const policiesSummary = policies.map(policy => {
    const typeLabel = POLICY_TYPE_LABELS[policy.policy_type_parent] || policy.policy_type_parent;
    const carNumber = policy.car?.car_number || '-';
    return `
      <div class="policy-item">
        <span class="policy-type">${typeLabel}</span>
        <span class="policy-period">${formatDate(policy.start_date)} - ${formatDate(policy.end_date)}</span>
        <span class="policy-car">${carNumber}</span>
        <span class="policy-price">₪${(policy.insurance_price || 0).toLocaleString()}</span>
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <title>فاتورة شاملة - ${client.full_name || 'عميل'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #2d3748;
      background: #f7fafc;
      padding: 20px;
      direction: rtl;
    }
    .container { 
      max-width: 800px; 
      margin: 0 auto; 
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      text-align: center;
      padding: 25px 20px;
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8a 100%);
      color: white;
    }
    .header h1 { 
      font-size: 22px; 
      font-weight: 800;
      margin-bottom: 5px;
    }
    .header .english-name {
      font-size: 11px;
      letter-spacing: 2px;
      opacity: 0.8;
    }
    .header .invoice-title {
      font-size: 16px;
      font-weight: 700;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.3);
    }
    .invoice-date {
      font-size: 12px;
      opacity: 0.9;
      margin-top: 5px;
    }
    .section {
      padding: 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e3a5f;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .client-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dashed #e2e8f0;
    }
    .info-label {
      color: #718096;
      font-weight: 500;
    }
    .info-value {
      color: #1e3a5f;
      font-weight: 700;
    }
    .policies-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .policy-item {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 100px;
      gap: 10px;
      padding: 10px 12px;
      background: #f8fafc;
      border-radius: 8px;
      font-size: 12px;
    }
    .policy-type { font-weight: 700; color: #1e3a5f; }
    .policy-period { color: #718096; }
    .policy-car { font-family: monospace; }
    .policy-price { font-weight: 700; color: #047857; text-align: left; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      background: #f1f5f9;
      padding: 12px 10px;
      text-align: right;
      font-weight: 700;
      color: #1e3a5f;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 12px 10px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    td.amount {
      font-weight: 700;
      color: #047857;
      white-space: nowrap;
    }
    td.details {
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-cash { background: #d1fae5; color: #065f46; }
    .badge-visa { background: #dbeafe; color: #1e40af; }
    .badge-cheque { background: #fef3c7; color: #92400e; }
    .badge-transfer { background: #e9d5ff; color: #6b21a8; }
    .approved { color: #059669; font-weight: 600; }
    .refused { color: #dc2626; font-weight: 600; }
    .totals {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      padding: 20px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    }
    .total-card {
      text-align: center;
      padding: 15px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .total-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 5px;
    }
    .total-value {
      font-size: 24px;
      font-weight: 800;
    }
    .total-value.paid { color: #059669; }
    .total-value.remaining { color: #dc2626; }
    .total-value.total { color: #1e3a5f; }
    .footer {
      text-align: center;
      padding: 20px;
      background: #f8fafc;
      color: #718096;
      font-size: 12px;
    }
    .thank-you {
      font-size: 16px;
      font-weight: 700;
      color: #1e3a5f;
      margin-bottom: 8px;
    }
    .print-button {
      display: block;
      width: calc(100% - 40px);
      margin: 0 20px;
      padding: 12px;
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8a 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Tajawal', sans-serif;
    }
    .print-button:hover { opacity: 0.9; }
    @media (max-width: 600px) {
      .policy-item { grid-template-columns: 1fr 1fr; }
      .totals { grid-template-columns: 1fr; }
      .total-value { font-size: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>بشير للتأمينات</h1>
      <p class="english-name">BASHEER INSURANCE</p>
      <p class="invoice-title">📋 فاتورة شاملة بالدفعات</p>
      <p class="invoice-date">تاريخ الإصدار: ${formatDate(new Date().toISOString())}</p>
    </div>

    <div class="section">
      <div class="section-title">👤 بيانات العميل</div>
      <div class="client-info">
        <div class="info-item">
          <span class="info-label">الاسم:</span>
          <span class="info-value">${client.full_name || '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">رقم الهوية:</span>
          <span class="info-value">${client.id_number || '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">رقم الهاتف:</span>
          <span class="info-value">${client.phone_number || '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">رقم الملف:</span>
          <span class="info-value">${client.file_number || '-'}</span>
        </div>
      </div>
    </div>

    ${policies.length > 0 ? `
    <div class="section">
      <div class="section-title">📄 الوثائق</div>
      <div class="policies-grid">
        ${policiesSummary}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">💳 سجل الدفعات</div>
      ${payments.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>المبلغ</th>
            <th>الطريقة</th>
            <th>التفاصيل</th>
            <th>الوثيقة</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows}
        </tbody>
      </table>
      ` : '<p style="text-align: center; color: #718096; padding: 20px;">لا توجد دفعات مسجلة</p>'}
    </div>

    <div class="totals">
      <div class="total-card">
        <p class="total-label">إجمالي التأمين</p>
        <p class="total-value total">₪${totals.totalInsurance.toLocaleString()}</p>
      </div>
      <div class="total-card">
        <p class="total-label">إجمالي المدفوع</p>
        <p class="total-value paid">₪${totals.totalPaid.toLocaleString()}</p>
      </div>
      <div class="total-card">
        <p class="total-label">المتبقي</p>
        <p class="total-value remaining">₪${totals.totalRemaining.toLocaleString()}</p>
      </div>
    </div>

    <div class="footer">
      <p class="thank-you">شكراً لتعاملكم معنا 🙏</p>
      <button class="print-button no-print" onclick="window.print()">🖨️ طباعة الفاتورة</button>
    </div>
  </div>
</body>
</html>
  `;
}

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
    const bunnyApiKey = Deno.env.get('BUNNY_API_KEY');
    const bunnyStorageZone = Deno.env.get('BUNNY_STORAGE_ZONE');
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

    const { client_id } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: "client_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-client-payments-invoice] Processing client: ${client_id}`);

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, full_name, id_number, phone_number, file_number")
      .eq("id", client_id)
      .single();

    if (clientError || !client) {
      console.error("[generate-client-payments-invoice] Client not found:", clientError);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active policies for this client
    const { data: policies, error: policiesError } = await supabase
      .from("policies")
      .select(`
        id,
        policy_type_parent,
        policy_type_child,
        start_date,
        end_date,
        insurance_price,
        cancelled,
        transferred,
        car:cars(car_number)
      `)
      .eq("client_id", client_id)
      .is("deleted_at", null)
      .eq("cancelled", false)
      .eq("transferred", false)
      .order("created_at", { ascending: false });

    if (policiesError) throw policiesError;

    const policyIds = (policies || []).map(p => p.id);

    // Get all payments for these policies
    let payments: any[] = [];
    if (policyIds.length > 0) {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("policy_payments")
        .select(`
          id,
          amount,
          payment_type,
          payment_date,
          cheque_number,
          cheque_date,
          card_last_four,
          installments_count,
          tranzila_approval_code,
          refused,
          policy_id
        `)
        .in("policy_id", policyIds)
        .order("payment_date", { ascending: false });

      if (paymentsError) throw paymentsError;

      // Map payments with policy info
      payments = (paymentsData || []).map(payment => ({
        ...payment,
        policy: policies?.find(p => p.id === payment.policy_id) || null,
      }));
    }

    // Calculate totals
    const totalInsurance = (policies || []).reduce((sum, p) => sum + (p.insurance_price || 0), 0);
    const totalPaid = payments.filter(p => !p.refused).reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalRemaining = Math.max(0, totalInsurance - totalPaid);

    // Generate HTML
    const invoiceHtml = buildComprehensiveInvoiceHtml(client, policies || [], payments, {
      totalInsurance,
      totalPaid,
      totalRemaining,
    });

    // If no Bunny credentials, return HTML directly
    if (!bunnyApiKey || !bunnyStorageZone) {
      return new Response(invoiceHtml, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // Upload to Bunny CDN
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    const clientNameSafe = client.full_name?.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_') || 'customer';
    const storagePath = `invoices/${year}/${month}/comprehensive_invoice_${clientNameSafe}_${timestamp}_${randomId}.html`;

    const bunnyUploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${storagePath}`;
    
    console.log(`[generate-client-payments-invoice] Uploading invoice to: ${bunnyUploadUrl}`);

    const uploadResponse = await fetch(bunnyUploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': bunnyApiKey,
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: invoiceHtml,
    });

    if (!uploadResponse.ok) {
      console.error('[generate-client-payments-invoice] Bunny upload failed');
      return new Response(invoiceHtml, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
      });
    }

    const invoiceUrl = `${bunnyCdnUrl}/${storagePath}`;
    console.log(`[generate-client-payments-invoice] Invoice uploaded: ${invoiceUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        invoice_url: invoiceUrl,
        totals: { totalInsurance, totalPaid, totalRemaining }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-client-payments-invoice] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
