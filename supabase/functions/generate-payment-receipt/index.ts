import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeneratePaymentReceiptRequest {
  payment_id: string;
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'מזומן',
  cheque: 'שיק',
  visa: 'כרטיס אשראי',
  transfer: 'העברה בנקאית',
};

const POLICY_TYPE_LABELS: Record<string, string> = {
  ELZAMI: 'חובה',
  THIRD_FULL: 'צד ג׳/מקיף',
  ROAD_SERVICE: 'שירותי דרך',
  ACCIDENT_FEE_EXEMPTION: 'פטור דמי תאונה',
  THIRD: 'צד ג׳',
  FULL: 'מקיף',
  HEALTH: 'בריאות',
  LIFE: 'חיים',
  PROPERTY: 'רכוש',
  TRAVEL: 'נסיעות',
  BUSINESS: 'עסקי',
  OTHER: 'אחר',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
    ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

interface PhoneLink { phone: string; href: string; }

function buildPaymentDetail(payment: any): string {
  if (payment.payment_type === 'visa') {
    const card = payment.card_last_four ? `**** ${payment.card_last_four}` : '';
    const inst = payment.installments_count && payment.installments_count > 1 ? ` / ${payment.installments_count} תשלומים` : ' / רגיל';
    return `ויזה ${card}${inst}`;
  }
  if (payment.payment_type === 'cheque') {
    return payment.cheque_number ? `שיק מס׳ ${payment.cheque_number}` : 'שיק';
  }
  if (payment.payment_type === 'transfer') {
    return 'העברה בנקאית';
  }
  return 'מזומן';
}

function buildReceiptHtml(
  payments: { payment_type: string; amount: number; payment_date: string; cheque_number?: string; cheque_date?: string; card_last_four?: string; installments_count?: number; tranzila_approval_code?: string; id: string }[],
  totalAmount: number,
  client: any,
  car: any,
  policyTypesText: string,
  receiptId: string,
  logoUrl: string,
  companySettings: { company_email?: string; company_phone_links?: PhoneLink[]; company_location?: string }
): string {
  const paymentDate = payments[0]?.payment_date || new Date().toISOString();

  const paymentRows = payments.map((p, i) => {
    const typeLabel = PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type;
    const detail = buildPaymentDetail(p);
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${typeLabel}</td>
        <td>${detail}</td>
        <td>${formatDate(p.payment_date)}</td>
        <td class="amount-cell">₪${(p.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`;
  }).join('');

  const phoneLinksHtml = (companySettings.company_phone_links || []).map(
    (link: PhoneLink) => `<span>${link.phone}</span>`
  ).join(' | ');

  const logoImg = logoUrl 
    ? `<img src="${logoUrl}" alt="Logo" class="logo" />`
    : `<div class="logo-placeholder">AB</div>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>קבלה ${receiptId} - ${client?.full_name || ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    @media print {
      body { padding: 0; background: white; }
      .no-print { display: none !important; }
      .container { box-shadow: none; border: none; }
    }
    body {
      font-family: Arial, Tahoma, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1a1a1a;
      background: #f0f2f5;
      padding: 20px;
      direction: rtl;
    }
    .container {
      max-width: 794px;
      margin: 0 auto;
      background: white;
      border: 2px solid #1a3a5c;
      min-height: 600px;
    }
    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 30px;
      border-bottom: 3px solid #1a3a5c;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .logo { height: 70px; width: auto; object-fit: contain; }
    .logo-placeholder {
      width: 70px; height: 70px; background: #1a3a5c; color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: bold; border-radius: 8px;
    }
    .company-info { text-align: right; }
    .company-name { font-size: 22px; font-weight: bold; color: #1a3a5c; }
    .company-name-en { font-size: 11px; color: #666; letter-spacing: 1px; }
    .company-detail { font-size: 12px; color: #444; margin-top: 2px; }
    .header-left { text-align: left; font-size: 12px; color: #444; }
    .header-left div { margin-bottom: 2px; }

    /* Receipt meta */
    .receipt-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 30px;
      border-bottom: 1px solid #ddd;
    }
    .receipt-title-block {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .receipt-label {
      font-size: 22px;
      font-weight: bold;
      color: #1a3a5c;
    }
    .receipt-num {
      font-size: 18px;
      font-weight: bold;
      color: #c0392b;
    }
    .receipt-origin {
      background: #e8f0fe;
      padding: 4px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: bold;
      color: #1a3a5c;
    }

    /* Client info row */
    .client-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 30px;
      border-bottom: 1px solid #ddd;
      font-size: 14px;
    }
    .client-name { font-weight: bold; }

    /* Subject bar */
    .subject-bar {
      background: #d6e4f0;
      padding: 10px 30px;
      font-weight: bold;
      font-size: 15px;
      color: #1a3a5c;
      border-bottom: 1px solid #b0c4d8;
    }

    /* Payment table */
    .table-section { padding: 20px 30px; }
    .table-header-label {
      background: #1a3a5c;
      color: white;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      display: inline-block;
      border-radius: 4px 4px 0 0;
      margin-bottom: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #ccc;
    }
    th {
      background: #e8eef4;
      color: #1a3a5c;
      font-weight: bold;
      padding: 10px 12px;
      font-size: 13px;
      border: 1px solid #ccc;
      text-align: center;
    }
    td {
      padding: 10px 12px;
      border: 1px solid #ccc;
      text-align: center;
      font-size: 13px;
    }
    .amount-cell { font-weight: bold; }

    /* Total */
    .total-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 15px 30px;
      gap: 15px;
    }
    .total-label {
      font-size: 16px;
      font-weight: bold;
      color: #1a3a5c;
    }
    .total-value {
      background: #1a3a5c;
      color: white;
      padding: 8px 24px;
      border-radius: 6px;
      font-size: 20px;
      font-weight: bold;
    }

    /* Signature section */
    .signature-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 30px 30px 20px;
      margin-top: 20px;
    }
    .signature-stamp {
      text-align: center;
    }
    .stamp-img { height: 60px; width: auto; opacity: 0.7; }
    .signature-line {
      width: 200px;
      border-top: 1px solid #999;
      padding-top: 5px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }

    /* Footer */
    .footer {
      border-top: 2px solid #1a3a5c;
      padding: 12px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #888;
      background: #fafafa;
    }
    .footer-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #1a3a5c;
      font-weight: bold;
      font-size: 11px;
    }

    /* Action buttons */
    .action-buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
      padding: 20px;
    }
    .btn {
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
      font-family: Arial, Tahoma, sans-serif;
    }
    .btn-print { background: #1a3a5c; color: white; }
    .btn-share { background: #25D366; color: white; }
    .btn:hover { opacity: 0.9; }

    @media (max-width: 600px) {
      .header { flex-direction: column; text-align: center; gap: 10px; }
      .header-right { flex-direction: column; }
      .header-left { text-align: center; }
      .receipt-meta { flex-direction: column; gap: 8px; text-align: center; }
      .client-row { flex-direction: column; gap: 4px; }
      .total-row { justify-content: center; }
      .signature-section { flex-direction: column; align-items: center; gap: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-right">
        ${logoImg}
        <div class="company-info">
          <div class="company-name">בשיר אבו סנינה לביטוח ושיווק</div>
          <div class="company-name-en">BASHEER ABU SNEINEH INSURANCE</div>
          <div class="company-detail">עוסק מורשה: 212426498</div>
        </div>
      </div>
      <div class="header-left">
        ${companySettings.company_location ? `<div>📍 ${companySettings.company_location}</div>` : ''}
        ${phoneLinksHtml ? `<div>📞 ${phoneLinksHtml}</div>` : ''}
        ${companySettings.company_email ? `<div>📧 ${companySettings.company_email}</div>` : ''}
      </div>
    </div>

    <div class="receipt-meta">
      <div class="receipt-title-block">
        <span class="receipt-label">קבלה</span>
        <span class="receipt-num">${receiptId}</span>
      </div>
      <span class="receipt-origin">מקור</span>
    </div>

    <div class="client-row">
      <div><span>לכבוד: </span><span class="client-name">${client?.full_name || '-'}</span>${client?.id_number ? ` (ת.ז. ${client.id_number})` : ''}</div>
      <div>תאריך: ${formatDate(paymentDate)}</div>
    </div>

    <div class="subject-bar">
      ביטוח ${policyTypesText}${car?.car_number ? ` / רכב ${car.car_number}` : ''} / ${client?.full_name || ''}
    </div>

    <div class="table-section">
      <div class="table-header-label">פרטי תשלומים</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>אמצעי תשלום</th>
            <th>פירוט</th>
            <th>תאריך</th>
            <th>סכום</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows}
        </tbody>
      </table>
    </div>

    <div class="total-row">
      <span class="total-label">סה"כ</span>
      <span class="total-value">₪${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>

    <div class="signature-section">
      <div class="signature-stamp">
        ${logoUrl ? `<img src="${logoUrl}" alt="Stamp" class="stamp-img" />` : ''}
      </div>
      <div class="signature-line">:חתימה</div>
    </div>

    <div class="footer">
      <div class="footer-badge">🔒 חתימה דיגיטלית מאובטחת</div>
      <div>הופק ב ${formatDateTime(new Date().toISOString())} | קבלה ${receiptId}</div>
    </div>
  </div>

  <div class="action-buttons no-print">
    <button class="btn btn-print" onclick="window.print()">🖨️ הדפסה</button>
    <button class="btn btn-share" onclick="shareReceipt()">📲 שיתוף</button>
  </div>

  <script>
    function shareReceipt() {
      var url = window.location.href;
      var text = 'קבלה: ' + url;
      if (navigator.share) {
        navigator.share({ title: 'קבלה', text: 'קבלת תשלום ביטוח', url: url }).catch(function(){});
      } else {
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      }
    }
  </script>
</body>
</html>`;
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

    const { payment_id }: GeneratePaymentReceiptRequest = await req.json();

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: "payment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-payment-receipt] Processing payment: ${payment_id}`);

    // Fetch company settings + logo in parallel
    const [smsSettingsResult, siteSettingsResult] = await Promise.all([
      supabase.from("sms_settings").select("company_email, company_phone_links, company_location").limit(1).maybeSingle(),
      supabase.from("site_settings").select("logo_url").limit(1).maybeSingle(),
    ]);

    const smsSettings = smsSettingsResult.data;
    const logoUrl = siteSettingsResult.data?.logo_url || '';

    const companySettings = {
      company_email: smsSettings?.company_email || '',
      company_phone_links: (smsSettings?.company_phone_links as any[]) || [],
      company_location: smsSettings?.company_location || '',
    };

    // Get payment with policy and client info
    const { data: payment, error: paymentError } = await supabase
      .from("policy_payments")
      .select(`
        id, amount, payment_type, payment_date,
        cheque_number, cheque_date, card_last_four, card_expiry,
        installments_count, tranzila_approval_code, notes,
        policy:policies(
          id, policy_number, policy_type_parent, policy_type_child,
          start_date, end_date, insurance_price,
          client:clients(id, full_name, id_number, phone_number),
          car:cars(car_number, manufacturer_name, model, year)
        )
      `)
      .eq("id", payment_id)
      .single();

    if (paymentError || !payment) {
      console.error("[generate-payment-receipt] Payment not found:", paymentError);
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const policy = (payment as any).policy;
    const client = policy?.client?.[0] || policy?.client || {};
    const car = policy?.car?.[0] || policy?.car || {};

    // Build policy type text
    let policyTypeKey = policy?.policy_type_parent || '';
    if (policyTypeKey === 'THIRD_FULL' && policy?.policy_type_child) {
      policyTypeKey = policy.policy_type_child;
    }
    const policyTypesText = POLICY_TYPE_LABELS[policyTypeKey] || policyTypeKey;

    const receiptId = payment.id.slice(0, 8).toUpperCase();

    const receiptHtml = buildReceiptHtml(
      [payment as any],
      payment.amount || 0,
      client,
      car,
      policyTypesText,
      receiptId,
      logoUrl,
      companySettings
    );

    if (!bunnyApiKey || !bunnyStorageZone) {
      return new Response(receiptHtml, {
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
    const clientNameSafe = client?.full_name?.replace(/[^a-zA-Z0-9\u0600-\u06FF\u0590-\u05FF]/g, '_') || 'customer';
    const storagePath = `receipts/${year}/${month}/receipt_${clientNameSafe}_${timestamp}_${randomId}.html`;

    const bunnyUploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${storagePath}`;
    
    console.log(`[generate-payment-receipt] Uploading receipt to: ${bunnyUploadUrl}`);

    const uploadResponse = await fetch(bunnyUploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': bunnyApiKey,
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: receiptHtml,
    });

    if (!uploadResponse.ok) {
      console.error('[generate-payment-receipt] Bunny upload failed');
      return new Response(receiptHtml, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
      });
    }

    const receiptUrl = `${bunnyCdnUrl}/${storagePath}`;
    console.log(`[generate-payment-receipt] Receipt uploaded: ${receiptUrl}`);

    return new Response(
      JSON.stringify({ success: true, receipt_url: receiptUrl, payment_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[generate-payment-receipt] Fatal error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
