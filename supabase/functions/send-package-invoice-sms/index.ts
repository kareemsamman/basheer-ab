import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendPackageInvoiceSmsRequest {
  policy_ids: string[];
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
  THIRD: 'ثالث',
  FULL: 'شامل',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'نقدي',
  cheque: 'شيك',
  visa: 'فيزا',
  transfer: 'تحويل',
};

const CAR_TYPE_LABELS: Record<string, string> = {
  car: 'سيارة خاصة',
  cargo: 'شحن',
  small: 'صغيرة',
  taxi: 'تاكسي',
  tjeradown4: 'تجارة أقل من 4 طن',
  tjeraup4: 'تجارة أكثر من 4 طن',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

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

    const { policy_ids }: SendPackageInvoiceSmsRequest = await req.json();

    if (!policy_ids || policy_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "policy_ids is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-package-invoice-sms] Processing ${policy_ids.length} policies`);

    // Get all policies with related data
    const { data: policies, error: policiesError } = await supabase
      .from("policies")
      .select(`
        *,
        client:clients(full_name, phone_number, id_number, signature_url),
        car:cars(car_number, manufacturer_name, model, year, car_type, color),
        company:insurance_companies(name, name_ar),
        broker:brokers(name)
      `)
      .in("id", policy_ids);

    if (policiesError || !policies || policies.length === 0) {
      console.error("[send-package-invoice-sms] Policies not found:", policiesError);
      return new Response(
        JSON.stringify({ error: "Policies not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All policies should have the same client
    const client = policies[0].client;
    if (!client?.phone_number) {
      return new Response(
        JSON.stringify({ error: "رقم هاتف العميل مطلوب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get insurance files for all policies
    const { data: insuranceFiles, error: filesError } = await supabase
      .from("media_files")
      .select("id, cdn_url, original_name, entity_id")
      .in("entity_id", policy_ids)
      .in("entity_type", ["policy", "policy_insurance"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (filesError) {
      console.error("[send-package-invoice-sms] Error fetching files:", filesError);
    }

    if (!insuranceFiles || insuranceFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "يجب رفع ملفات البوليصات أولاً" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get SMS settings
    const { data: smsSettings, error: smsSettingsError } = await supabase
      .from("sms_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (smsSettingsError || !smsSettings || !smsSettings.is_enabled) {
      return new Response(
        JSON.stringify({ error: "خدمة الرسائل غير مفعلة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!bunnyApiKey || !bunnyStorageZone) {
      return new Response(
        JSON.stringify({ error: 'إعدادات التخزين غير مكتملة' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payments for all policies
    const { data: allPayments } = await supabase
      .from('policy_payments')
      .select('policy_id, payment_type, amount, payment_date')
      .in('policy_id', policy_ids)
      .eq('refused', false)
      .order('created_at', { ascending: true });

    // Group payments by policy
    const paymentsByPolicy: Record<string, any[]> = {};
    (allPayments || []).forEach(p => {
      if (!paymentsByPolicy[p.policy_id]) {
        paymentsByPolicy[p.policy_id] = [];
      }
      paymentsByPolicy[p.policy_id].push(p);
    });

    // Calculate totals
    const totalPrice = policies.reduce((sum, p) => sum + (p.insurance_price || 0), 0);
    const totalPaid = (allPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalRemaining = totalPrice - totalPaid;

    // Generate Package Invoice HTML
    const packageInvoiceHtml = buildPackageInvoiceHtml(policies, paymentsByPolicy, totalPrice, totalPaid, totalRemaining);
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    const clientNameSafe = client?.full_name?.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_') || 'customer';
    const storagePath = `invoices/${year}/${month}/package_invoice_${clientNameSafe}_${timestamp}_${randomId}.html`;

    // Upload to Bunny Storage
    const bunnyUploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${storagePath}`;
    
    console.log(`[send-package-invoice-sms] Uploading package invoice to: ${bunnyUploadUrl}`);

    const uploadResponse = await fetch(bunnyUploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': bunnyApiKey,
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: packageInvoiceHtml,
    });

    if (!uploadResponse.ok) {
      console.error('[send-package-invoice-sms] Bunny upload failed');
      return new Response(
        JSON.stringify({ error: 'فشل في رفع الفاتورة' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const packageInvoiceUrl = `${bunnyCdnUrl}/${storagePath}`;
    console.log(`[send-package-invoice-sms] Package Invoice uploaded: ${packageInvoiceUrl}`);

    // Build policy file URLs (all files from all policies)
    const policyFileUrls = insuranceFiles.map(f => f.cdn_url);

    // Build SMS message
    let smsMessage = `مرحباً ${client.full_name}، تم إصدار فواتير وثيقة التأمين\n\nالبوليصة ${packageInvoiceUrl}`;
    
    // Add all policy file URLs
    if (policyFileUrls.length > 0) {
      smsMessage += `\n\nفاتورة شركة التأمين:`;
      policyFileUrls.forEach((url, index) => {
        if (policyFileUrls.length > 1) {
          smsMessage += `\n${index + 1}. ${url}`;
        } else {
          smsMessage += ` ${url}`;
        }
      });
    }

    const escapeXml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;");

    // Normalize phone
    let cleanPhone = client.phone_number.replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("972")) {
      cleanPhone = "0" + cleanPhone.substring(3);
    }

    // Send SMS via 019sms
    const dlr = crypto.randomUUID();
    const smsXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<sms>` +
      `<user><username>${escapeXml(smsSettings.sms_user || "")}</username></user>` +
      `<source>${escapeXml(smsSettings.sms_source || "")}</source>` +
      `<destinations><phone id="${dlr}">${escapeXml(cleanPhone)}</phone></destinations>` +
      `<message>${escapeXml(smsMessage)}</message>` +
      `</sms>`;

    console.log(`[send-package-invoice-sms] Sending SMS to ${cleanPhone} with ${policyFileUrls.length} policy files`);

    const smsResponse = await fetch("https://019sms.co.il/api", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${smsSettings.sms_token}`,
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: smsXml,
    });

    const smsResult = await smsResponse.text();
    console.log("[send-package-invoice-sms] 019sms response:", smsResult);

    const extractTag = (xml: string, tag: string) => {
      const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      return match?.[1]?.trim() ?? null;
    };

    const status = extractTag(smsResult, "status");
    const apiMessage = extractTag(smsResult, "message");

    if (!smsResponse.ok || status !== "0") {
      console.error(`[send-package-invoice-sms] SMS failed: status=${status} message=${apiMessage}`);
      return new Response(
        JSON.stringify({ error: apiMessage || `خطأ في إرسال الرسالة` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark all policies as sent
    const { error: updateError } = await supabase
      .from("policies")
      .update({ invoices_sent_at: new Date().toISOString() })
      .in("id", policy_ids);

    if (updateError) {
      console.error("[send-package-invoice-sms] Error updating policies:", updateError);
    }

    const duration = Date.now() - startTime;
    console.log(`[send-package-invoice-sms] Completed in ${duration}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "تم إرسال الوثائق عبر الرسائل",
        sent_to: cleanPhone,
        policy_count: policy_ids.length,
        file_count: policyFileUrls.length,
        package_invoice_url: packageInvoiceUrl,
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[send-package-invoice-sms] Fatal error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ar-EG', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    calendar: 'gregory'
  });
}

function buildPackageInvoiceHtml(
  policies: any[],
  paymentsByPolicy: Record<string, any[]>,
  totalPrice: number,
  totalPaid: number,
  remaining: number
): string {
  const client = policies[0]?.client || {};
  const isPaid = remaining <= 0;

  // Build policy rows
  const policyRows = policies.map((p, i) => {
    const policyPayments = paymentsByPolicy[p.id] || [];
    const policyPaid = policyPayments.reduce((sum: number, pay: any) => sum + (pay.amount || 0), 0);
    const policyRemaining = (p.insurance_price || 0) - policyPaid;
    const policyType = POLICY_TYPE_LABELS[p.policy_type_parent] || p.policy_type_parent;
    
    return `
      <tr>
        <td style="padding: 12px; border: 1px solid #e2e8f0;">${i + 1}</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0;">${policyType}</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0;">${p.company?.name_ar || p.company?.name || '-'}</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0;">${p.car?.car_number || '-'}</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0;">₪${(p.insurance_price || 0).toLocaleString()}</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0; color: #22c55e;">₪${policyPaid.toLocaleString()}</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0; color: ${policyRemaining > 0 ? '#ef4444' : '#22c55e'};">₪${policyRemaining.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  // Build all payments table
  const allPaymentsRows: string[] = [];
  policies.forEach(p => {
    const policyPayments = paymentsByPolicy[p.id] || [];
    const policyType = POLICY_TYPE_LABELS[p.policy_type_parent] || p.policy_type_parent;
    policyPayments.forEach((pay, i) => {
      allPaymentsRows.push(`
        <tr>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${policyType}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${formatDate(pay.payment_date)}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${PAYMENT_TYPE_LABELS[pay.payment_type] || pay.payment_type}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">₪${(pay.amount || 0).toLocaleString()}</td>
        </tr>
      `);
    });
  });

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <title>فاتورة باقة - ${client.full_name || 'عميل'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #2d3748;
      background: #fff;
      padding: 25px;
      direction: rtl;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding: 30px;
      background: linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%);
      border-radius: 12px;
      border-bottom: 3px solid #1e3a5f;
    }
    .header h1 { color: #1e3a5f; font-size: 28px; font-weight: 800; margin-bottom: 8px; }
    .header .english-name { color: #4a5568; font-size: 18px; font-weight: 500; letter-spacing: 2px; margin-bottom: 10px; }
    .header p { color: #718096; font-size: 15px; }
    .package-badge {
      display: inline-block;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 8px 20px;
      border-radius: 20px;
      font-weight: 700;
      margin-top: 15px;
    }
    .summary-cards {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      margin-bottom: 30px;
      flex-wrap: wrap;
    }
    .summary-card {
      flex: 1;
      min-width: 120px;
      text-align: center;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .summary-card.total { background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%); }
    .summary-card.paid { background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); }
    .summary-card.remaining { background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); }
    .summary-card strong { display: block; font-size: 13px; color: #4a5568; margin-bottom: 8px; }
    .summary-card .value { font-size: 24px; font-weight: 800; }
    .summary-card.total .value { color: #1e3a5f; }
    .summary-card.paid .value { color: #059669; }
    .summary-card.remaining .value { color: #dc2626; }
    .section { margin-bottom: 28px; }
    .section-title {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
      color: white;
      padding: 12px 18px;
      font-size: 17px;
      font-weight: 700;
      border-radius: 8px 8px 0 0;
    }
    .section-content {
      border: 1px solid #e2e8f0;
      border-top: none;
      padding: 18px;
      border-radius: 0 0 8px 8px;
      background: #fafbfc;
    }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 12px;
      background: white;
      border-radius: 6px;
      border-bottom: 1px dashed #e2e8f0;
    }
    .info-label { color: #718096; font-weight: 500; }
    .info-value { color: #1e3a5f; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th {
      background: linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%);
      padding: 12px;
      border: 1px solid #ddd;
      text-align: right;
      font-weight: 700;
      color: #1e3a5f;
    }
    td { padding: 10px 12px; border: 1px solid #e2e8f0; text-align: right; background: white; }
    .total-row { background: #f0f4f8; font-weight: bold; }
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 14px;
    }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-partial { background: #fef3c7; color: #92400e; }
    .status-unpaid { background: #fee2e2; color: #991b1b; }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 25px;
      border-top: 2px solid #e2e8f0;
      color: #718096;
      font-size: 13px;
    }
    .signature { text-align: left; margin-top: 20px; font-style: italic; color: #1e3a5f; font-weight: 600; }
    @media (max-width: 600px) {
      .summary-cards { flex-direction: column; }
      .info-grid { grid-template-columns: 1fr; }
      table { font-size: 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>وكالة بشير للتأمين</h1>
      <p class="english-name">BASHEER INSURANCE</p>
      <p>فاتورة باقة تأمين</p>
      <div class="package-badge">📦 باقة ${policies.length} وثائق</div>
    </div>

    <div class="summary-cards">
      <div class="summary-card total">
        <strong>إجمالي الباقة</strong>
        <div class="value">₪${totalPrice.toLocaleString()}</div>
      </div>
      <div class="summary-card paid">
        <strong>المدفوع</strong>
        <div class="value">₪${totalPaid.toLocaleString()}</div>
      </div>
      <div class="summary-card remaining">
        <strong>المتبقي</strong>
        <div class="value">₪${remaining.toLocaleString()}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">📋 بيانات العميل</div>
      <div class="section-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">الاسم</span>
            <span class="info-value">${client.full_name || '-'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">رقم الهوية</span>
            <span class="info-value">${client.id_number || '-'}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">📦 وثائق الباقة</div>
      <div class="section-content">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>نوع التأمين</th>
              <th>الشركة</th>
              <th>السيارة</th>
              <th>السعر</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${policyRows}
            <tr class="total-row">
              <td colspan="4" style="text-align: center; font-weight: bold;">الإجمالي</td>
              <td style="font-weight: bold;">₪${totalPrice.toLocaleString()}</td>
              <td style="font-weight: bold; color: #22c55e;">₪${totalPaid.toLocaleString()}</td>
              <td style="font-weight: bold; color: ${remaining > 0 ? '#ef4444' : '#22c55e'};">₪${remaining.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    ${allPaymentsRows.length > 0 ? `
    <div class="section">
      <div class="section-title">💳 سجل الدفعات</div>
      <div class="section-content">
        <table>
          <thead>
            <tr>
              <th>الوثيقة</th>
              <th>التاريخ</th>
              <th>طريقة الدفع</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${allPaymentsRows.join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">📊 حالة الدفع</div>
      <div class="section-content" style="text-align: center; padding: 30px;">
        <span class="status-badge ${isPaid ? 'status-paid' : remaining < totalPrice ? 'status-partial' : 'status-unpaid'}">
          ${isPaid ? '✓ مدفوعة بالكامل' : remaining < totalPrice ? `⏳ مدفوع جزئياً (${Math.round((totalPaid / totalPrice) * 100)}%)` : '⏱️ غير مدفوعة'}
        </span>
      </div>
    </div>

    <div class="footer">
      <p>تاريخ الإصدار: ${formatDate(new Date().toISOString())}</p>
      <p>شكراً لثقتكم بوكالة بشير للتأمين</p>
      <p class="signature">Basheer</p>
    </div>
  </div>
</body>
</html>
  `;
}
