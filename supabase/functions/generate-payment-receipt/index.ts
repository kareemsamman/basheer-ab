import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";
import { selectProviderReceipt } from "../_shared/providerReceipt.ts";

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
  bit: 'ביט',
};

const POLICY_TYPE_LABELS: Record<string, string> = {
  ELZAMI: 'חובה',
  THIRD_FULL: 'צד ג׳/מקיף',
  ROAD_SERVICE: 'שירותי דרך',
  ACCIDENT_FEE_EXEMPTION: 'פטור דמי תאונה',
  CIVIL_LIABILITY: 'אחריות אזרחית',
  THIRD: 'צד ג׳',
  FULL: 'מקיף',
  HEALTH: 'בריאות',
  LIFE: 'חיים',
  PROPERTY: 'רכוש',
  TRAVEL: 'נסיעות',
  BUSINESS: 'עסקי',
  OTHER: 'אחר',
};

// Main cover first, then the package add-ons
const POLICY_TYPE_ORDER = ['THIRD_FULL', 'CIVIL_LIABILITY', 'ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION'];

// Payments imported from the old system were all created in one run on
// 18/01/2026, so their created_at is not the day the money was received.
const LEGACY_IMPORT_LAST_DAY = '2026-01-18';

// The function runs in UTC; the receipt shows Israel time.
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { timeZone: ISRAEL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }) +
    ' ' + date.toLocaleTimeString('en-GB', { timeZone: ISRAEL_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
}

/** YYYY-MM-DD of a timestamp in Israel time */
function toIsraelDay(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * The day the money was received: the earliest day the printed payments were
 * entered. Imported payments only have their payment_date.
 */
function getReceivedDay(payments: { created_at?: string; payment_date: string }[]): string {
  const days = payments
    .map((p) => {
      const createdDay = p.created_at ? toIsraelDay(p.created_at) : '';
      return createdDay > LEGACY_IMPORT_LAST_DAY ? createdDay : p.payment_date;
    })
    .filter(Boolean)
    .sort();
  return days[0] || '';
}

/** e.g. "מקיף 123456 (01/10/2026–30/09/2027)" */
function describePolicy(policy: any): string {
  const typeKey = policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child
    ? policy.policy_type_child
    : policy.policy_type_parent;
  const label = POLICY_TYPE_LABELS[typeKey] || typeKey || '';
  const number = policy.policy_number ? ` ${policy.policy_number}` : '';
  const period = policy.start_date && policy.end_date
    ? ` (${formatDate(policy.start_date)}–${formatDate(policy.end_date)})`
    : '';
  return `${label}${number}${period}`;
}

function policyTypeRank(type: string): number {
  const index = POLICY_TYPE_ORDER.indexOf(type);
  return index === -1 ? POLICY_TYPE_ORDER.length : index;
}

/**
 * What the money paid for: each payment's policy and, for a package, the
 * package's policies that are still live. ELZAMI (חובה) is never printed.
 */
function buildSubjectText(payments: any[], packagePolicies: any[]): string {
  const livePackagePolicies = packagePolicies
    .filter((p) => !p.deleted_at && !p.cancelled && p.policy_type_parent !== 'ELZAMI')
    .sort((a, b) => policyTypeRank(a.policy_type_parent) - policyTypeRank(b.policy_type_parent));

  const covered = new Map<string, any>();
  const carNumbers = new Set<string>();
  for (const payment of payments) {
    const policy = payment.policy;
    if (!policy) continue;
    const members = policy.group_id ? livePackagePolicies.filter((p) => p.group_id === policy.group_id) : [];
    for (const p of [...members, policy]) {
      if (p.policy_type_parent !== 'ELZAMI' && !covered.has(p.id)) covered.set(p.id, p);
    }
    const car = policy.car?.[0] || policy.car;
    if (car?.car_number) carNumbers.add(car.car_number);
  }

  const description = [...covered.values()].map(describePolicy).join(' + ') || 'ביטוח';
  return carNumbers.size > 0 ? `${description} / רכב ${[...carNumbers].join(', ')}` : description;
}

/** "12" for one stored receipt number, "12–15" for several, null when none is stored */
function formatReceiptNumbers(numbers: number[]): string | null {
  const stored = numbers.filter((n) => n != null);
  if (stored.length === 0) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const min = Math.min(...stored);
  const max = Math.max(...stored);
  return min === max ? pad(min) : `${pad(min)}–${pad(max)}`;
}

/** Names of the employees who recorded the payments, in payment order */
function joinReceiverNames(payments: any[], profiles: any[]): string {
  const names = payments
    .map((payment) => profiles.find((p) => p.id === payment.created_by_admin_id)?.full_name?.trim())
    .filter(Boolean);
  return [...new Set(names)].join(', ');
}

interface PhoneLink { phone: string; href: string; }

// The method column already names the method, so only add what identifies it
function buildPaymentDetail(payment: any): string {
  if (payment.payment_type === 'cheque') {
    return payment.cheque_number ? `שיק מס׳ ${payment.cheque_number}` : 'שיק';
  }
  if (payment.payment_type === 'visa') {
    const parts: string[] = [];
    if (payment.card_last_four) parts.push(`**** ${payment.card_last_four}`);
    if (payment.installments_count && payment.installments_count > 1) parts.push(`${payment.installments_count} תשלומים`);
    return parts.join(' · ') || '—';
  }
  return '—';
}

function buildReceiptHtml(
  payments: { payment_type: string; amount: number; payment_date: string; created_at?: string; cheque_number?: string; cheque_date?: string; card_last_four?: string; installments_count?: number; tranzila_approval_code?: string; id: string }[],
  totalAmount: number,
  client: any,
  subjectText: string,
  receiptNumber: string | null,
  receivedBy: string,
  logoUrl: string,
  companySettings: { company_email?: string; company_phone_links?: PhoneLink[]; company_location?: string },
  issueDate: string | null = null
): string {
  const receivedDay = issueDate || getReceivedDay(payments);
  // Without a stored receipt number this is only a payment confirmation
  const isDraft = !receiptNumber;
  const docLabel = isDraft ? 'אישור תשלום' : 'קבלה';
  const docTitle = isDraft ? docLabel : `${docLabel} ${receiptNumber}`;

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
  <title>${docTitle} - ${client?.full_name || ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    @media print {
      body { padding: 0; background: white; }
      .no-print { display: none !important; }
      .container {
        box-shadow: none;
        border: 2px solid #1a3a5c;
        min-height: 100vh;
        page-break-inside: avoid;
      }
    }
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
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
      min-height: calc(100vh - 40px);
      display: flex;
      flex-direction: column;
    }
    .content-grow {
      flex: 1;
      display: flex;
      flex-direction: column;
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
    .signature-block {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .received-by {
      font-size: 13px;
      margin-bottom: 20px;
    }
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
          <div class="company-name">בשיר אבו סנינה לביטוח</div>
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

    <div class="content-grow">
      <div class="receipt-meta">
        <div class="receipt-title-block">
          <span class="receipt-label">${docLabel}</span>
          <span class="receipt-num">${isDraft ? 'טיוטה – אינה קבלה' : receiptNumber}</span>
        </div>
        ${isDraft ? '' : '<span class="receipt-origin">מקור</span>'}
      </div>

      <div class="client-row">
        <div><span>לכבוד: </span><span class="client-name">${client?.full_name || '-'}</span>${client?.id_number ? ` (ת.ז. ${client.id_number})` : ''}</div>
        <div>תאריך: ${formatDate(receivedDay)}</div>
      </div>

      <div class="subject-bar">
        ${subjectText}
      </div>

      <div class="table-section">
        <div class="table-header-label">פרטי תשלומים</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>אמצעי תשלום</th>
              <th>פירוט</th>
              <th>תאריך תשלום/פירעון</th>
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
        <div class="signature-block">
          ${receivedBy ? `<div class="received-by">התקבל ע״י: ${receivedBy}</div>` : ''}
          <div class="signature-line">:חתימה</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>הופק ב ${formatDateTime(new Date().toISOString())} | ${docTitle}</div>
    </div>
  </div>

  <div class="action-buttons no-print">
    <button class="btn btn-print" onclick="window.print()">🖨️ הדפסה</button>
    <button class="btn btn-share" onclick="shareReceipt()">📲 שיתוף</button>
  </div>

  <script>
    if (new URLSearchParams(window.location.search).get('print') === '1') {
      window.addEventListener('load', function () {
        setTimeout(function () { window.print(); }, 600);
      });
    }
    function shareReceipt() {
      var url = window.location.href;
      var text = '${docLabel}: ' + url;
      if (navigator.share) {
        navigator.share({ title: '${docLabel}', text: '${isDraft ? 'אישור תשלום ביטוח' : 'קבלת תשלום ביטוח'}', url: url }).catch(function(){});
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

    const PAYMENT_SELECT = `
        id, amount, payment_type, payment_date, created_at, refused, created_by_admin_id,
        locked, source, cheque_number, cheque_date, card_last_four, card_expiry,
        installments_count, tranzila_approval_code, notes,
        tranzila_transaction_id, tranzila_response_code, tranzila_receipt_url,
        policy:policies(
          id, policy_number, policy_type_parent, policy_type_child,
          start_date, end_date, insurance_price, group_id,
          client:clients(id, full_name, id_number, phone_number),
          car:cars(car_number, manufacturer_name, model, year)
        )
      `;

    // Get payment with policy and client info
    const { data: payment, error: paymentError } = await supabase
      .from("policy_payments")
      .select(PAYMENT_SELECT)
      .eq("id", payment_id)
      .single();

    if (paymentError || !payment) {
      console.error("[generate-payment-receipt] Payment not found:", paymentError);
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A refused payment (e.g. a returned cheque) was never received
    if (payment.refused) {
      return new Response(
        JSON.stringify({ error: "لا يمكن إصدار קבלה لدفعة مرفوضة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providerReceipt = selectProviderReceipt([payment]);
    if (providerReceipt.kind !== 'local') {
      return new Response(JSON.stringify(providerReceipt.kind === 'provider'
        ? { receipt_url: providerReceipt.url, provider: 'tranzila' }
        : { error: providerReceipt.message }), {
        status: providerReceipt.kind === 'provider' ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const policy = (payment as any).policy;

    // The receipts table decides what is printed: the payment's receipt, whole
    // (every live line sharing its number). The database gives no receipt to
    // ELZAMI placeholders, ₪0 or Tranzila card payments. A failed lookup must
    // not turn a receipt into a confirmation.
    const RECEIPT_SELECT = "payment_id, receipt_number, issue_date, cancelled_at, legacy_numbering";
    const { data: receiptRow, error: receiptError } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("payment_id", payment_id)
      .maybeSingle();
    if (receiptError) throw receiptError;

    if (receiptRow?.cancelled_at) {
      return new Response(
        JSON.stringify({ error: "הקבלה של תשלום זה מבוטלת" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let docReceipts: any[] = receiptRow ? [receiptRow] : [];
    let docPayments: any[] = [payment];
    if (receiptRow && !receiptRow.legacy_numbering) {
      const { data: allLines, error: linesError } = await supabase
        .from("receipts")
        .select(RECEIPT_SELECT)
        .eq("receipt_number", receiptRow.receipt_number)
        .is("cancelled_at", null)
        .not("payment_id", "is", null);
      if (linesError) throw linesError;
      if (allLines?.length) docReceipts = allLines;
      const otherIds = docReceipts.map((r: any) => r.payment_id).filter((id: string) => id !== payment_id);
      if (otherIds.length > 0) {
        const { data: others, error: othersError } = await supabase
          .from("policy_payments")
          .select(PAYMENT_SELECT)
          .in("id", otherIds);
        if (othersError) throw othersError;
        docPayments = [payment, ...(others || []).filter((p: any) => !p.refused)];
      }
    } else if (!receiptRow) {
      // No receipt of ours: a payment confirmation, never for ELZAMI or ₪0
      const isElzami = (payment as any).locked || (payment as any).source === 'system' ||
        policy?.policy_type_parent === 'ELZAMI' || Number(payment.amount) <= 0;
      if (isElzami) {
        return new Response(
          JSON.stringify({ error: "لا يمكن إصدار קבלה لتأمين الحوباه (חובה)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    docPayments.sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));

    const client = policy?.client?.[0] || policy?.client || {};

    // A package payment covers the package's other policies too
    const groupIds = [...new Set(docPayments.map((p: any) => p.policy?.group_id).filter(Boolean))];
    let packagePolicies: any[] = [];
    if (groupIds.length > 0) {
      const { data: packageRows, error: packageError } = await supabase
        .from("policies")
        .select("id, policy_number, policy_type_parent, policy_type_child, start_date, end_date, group_id, deleted_at, cancelled")
        .in("group_id", groupIds);
      if (packageError) throw packageError;
      packagePolicies = packageRows || [];
    }
    const subjectText = buildSubjectText(docPayments, packagePolicies);

    // Without a number the document is only a payment confirmation
    const receiptNumber = formatReceiptNumbers(docReceipts.map((r: any) => r.receipt_number));
    // The receipt's date is the day it was issued
    const issueDate = docReceipts.map((r: any) => r.issue_date).filter(Boolean).sort()[0] || null;
    const totalAmount = docPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

    // The employee who recorded the payment is the one who received it
    const adminIds = [...new Set(docPayments.map((p: any) => p.created_by_admin_id).filter(Boolean))];
    let receivedBy = '';
    if (adminIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", adminIds);
      receivedBy = joinReceiverNames(docPayments, profiles || []);
    }

    const receiptHtml = buildReceiptHtml(
      docPayments,
      totalAmount,
      client,
      subjectText,
      receiptNumber,
      receivedBy,
      logoUrl,
      companySettings,
      issueDate
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
