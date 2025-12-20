import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(buildErrorHtml("رابط غير صالح", "الرجاء التأكد من صحة الرابط"), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    console.log(`[signature-page] Looking up token: ${token.substring(0, 8)}...`);

    // Find signature record by token
    const { data: signatureRecord, error: signatureError } = await supabase
      .from("customer_signatures")
      .select(`
        id,
        token_expires_at,
        signature_image_url,
        signed_at,
        client_id,
        policy_id
      `)
      .eq("token", token)
      .maybeSingle();

    if (signatureError || !signatureRecord) {
      console.error("[signature-page] Token not found:", signatureError);
      return new Response(buildErrorHtml("رابط غير صالح", "هذا الرابط غير موجود أو منتهي الصلاحية"), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Get client info
    let clientName = "عميل";
    if (signatureRecord.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("full_name")
        .eq("id", signatureRecord.client_id)
        .single();
      if (clientData) {
        clientName = clientData.full_name;
      }
    }

    // Check if token is expired
    if (signatureRecord.token_expires_at && new Date(signatureRecord.token_expires_at) < new Date()) {
      return new Response(buildErrorHtml("الرابط منتهي الصلاحية", "انتهت صلاحية هذا الرابط، يرجى طلب رابط جديد"), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Check if already signed
    if (signatureRecord.signature_image_url && signatureRecord.signature_image_url !== "") {
      return new Response(buildSuccessHtml(clientName, signatureRecord.signed_at), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Get policy info if available
    let policyInfo = null;
    if (signatureRecord.policy_id) {
      const { data: policy } = await supabase
        .from("policies")
        .select(`
          policy_number,
          insurance_price,
          start_date,
          end_date,
          policy_type_parent,
          company:insurance_companies(name, name_ar),
          car:cars(car_number, manufacturer_name, model, year)
        `)
        .eq("id", signatureRecord.policy_id)
        .single();
      policyInfo = policy;
    }

    // Build and return the signature page HTML
    const html = buildSignaturePageHtml(clientName, token, signatureRecord.token_expires_at, policyInfo, supabaseUrl);
    
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  } catch (error: unknown) {
    console.error("[signature-page] Fatal error:", error);
    return new Response(buildErrorHtml("خطأ في النظام", "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً"), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
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

function buildErrorHtml(title: string, message: string): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <title>${title} | AB Insurance</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 50px 40px;
      text-align: center;
      max-width: 450px;
      width: 100%;
      box-shadow: 0 25px 50px rgba(0,0,0,0.15);
    }
    .icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 25px;
    }
    .icon svg { width: 40px; height: 40px; color: white; }
    h1 { color: #1e3a5f; font-size: 26px; margin-bottom: 15px; font-weight: 800; }
    p { color: #64748b; font-size: 16px; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function buildSuccessHtml(clientName: string, signedAt: string | null): string {
  const signedDate = signedAt ? formatDate(signedAt) : '';
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <title>تم التوقيع بنجاح | AB Insurance</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 50px 40px;
      text-align: center;
      max-width: 450px;
      width: 100%;
      box-shadow: 0 25px 50px rgba(0,0,0,0.15);
    }
    .icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 25px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    .icon svg { width: 40px; height: 40px; color: white; }
    h1 { color: #10b981; font-size: 26px; margin-bottom: 15px; font-weight: 800; }
    p { color: #64748b; font-size: 16px; line-height: 1.7; }
    .name { color: #1e3a5f; font-weight: 700; }
    .date { margin-top: 15px; font-size: 14px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h1>تم التوقيع بنجاح</h1>
    <p>شكراً لك <span class="name">${clientName}</span>،<br>تم حفظ توقيعك بنجاح</p>
    ${signedDate ? `<p class="date">تاريخ التوقيع: ${signedDate}</p>` : ''}
  </div>
</body>
</html>`;
}

function buildSignaturePageHtml(
  clientName: string, 
  token: string, 
  expiresAt: string | null,
  policyInfo: any,
  supabaseUrl: string
): string {
  const expiryText = expiresAt ? formatDate(expiresAt) : '';
  
  // Build policy details section if available
  let policySection = '';
  if (policyInfo) {
    const POLICY_TYPE_LABELS: Record<string, string> = {
      ELZAMI: 'إلزامي',
      THIRD_FULL: 'ثالث/شامل',
      ROAD_SERVICE: 'خدمات الطريق',
      ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
    };
    
    policySection = `
      <div class="policy-info">
        <h3>تفاصيل الوثيقة</h3>
        <div class="info-grid">
          ${policyInfo.policy_number ? `<div class="info-item"><span>رقم الوثيقة</span><strong>${policyInfo.policy_number}</strong></div>` : ''}
          ${policyInfo.policy_type_parent ? `<div class="info-item"><span>نوع التأمين</span><strong>${POLICY_TYPE_LABELS[policyInfo.policy_type_parent] || policyInfo.policy_type_parent}</strong></div>` : ''}
          ${policyInfo.company?.name_ar || policyInfo.company?.name ? `<div class="info-item"><span>شركة التأمين</span><strong>${policyInfo.company.name_ar || policyInfo.company.name}</strong></div>` : ''}
          ${policyInfo.car?.car_number ? `<div class="info-item"><span>رقم السيارة</span><strong>${policyInfo.car.car_number}</strong></div>` : ''}
          ${policyInfo.car?.manufacturer_name ? `<div class="info-item"><span>السيارة</span><strong>${policyInfo.car.manufacturer_name} ${policyInfo.car.model || ''} ${policyInfo.car.year || ''}</strong></div>` : ''}
          ${policyInfo.insurance_price ? `<div class="info-item"><span>السعر</span><strong>₪${policyInfo.insurance_price.toLocaleString()}</strong></div>` : ''}
          ${policyInfo.start_date ? `<div class="info-item"><span>تاريخ البداية</span><strong>${formatDate(policyInfo.start_date)}</strong></div>` : ''}
          ${policyInfo.end_date ? `<div class="info-item"><span>تاريخ الانتهاء</span><strong>${formatDate(policyInfo.end_date)}</strong></div>` : ''}
        </div>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <title>توقيع العميل | BASHEER INSURANCE</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 50%, #3d5a7f 100%);
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 24px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 30px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
      color: white;
      padding: 30px 25px;
      text-align: center;
    }
    .header h1 { 
      font-size: 28px; 
      font-weight: 800;
      margin-bottom: 5px;
    }
    .header .english { 
      font-size: 14px; 
      letter-spacing: 3px;
      opacity: 0.8;
      margin-bottom: 15px;
    }
    .header .welcome {
      font-size: 16px;
      opacity: 0.9;
    }
    .header .client-name {
      font-size: 22px;
      font-weight: 700;
      margin-top: 5px;
    }
    .content { padding: 25px; }
    .policy-info {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 25px;
    }
    .policy-info h3 {
      color: #1e3a5f;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    .info-grid { display: grid; gap: 10px; }
    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: white;
      border-radius: 8px;
      font-size: 14px;
    }
    .info-item span { color: #64748b; }
    .info-item strong { color: #1e3a5f; }
    .signature-section {
      margin-bottom: 20px;
    }
    .signature-section h3 {
      color: #1e3a5f;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 15px;
      text-align: center;
    }
    .canvas-wrapper {
      border: 3px dashed #cbd5e1;
      border-radius: 16px;
      background: #fafbfc;
      position: relative;
      overflow: hidden;
      touch-action: none;
    }
    .canvas-wrapper.active {
      border-color: #1e3a5f;
      border-style: solid;
    }
    #signatureCanvas {
      display: block;
      width: 100%;
      height: 200px;
      cursor: crosshair;
      touch-action: none;
    }
    .canvas-hint {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #94a3b8;
      font-size: 14px;
      pointer-events: none;
      transition: opacity 0.3s;
    }
    .canvas-hint.hidden { opacity: 0; }
    .checkbox-wrapper {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 15px;
      background: #f8fafc;
      border-radius: 12px;
      margin-bottom: 20px;
      cursor: pointer;
    }
    .checkbox-wrapper input[type="checkbox"] {
      width: 22px;
      height: 22px;
      accent-color: #1e3a5f;
      cursor: pointer;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .checkbox-wrapper label {
      font-size: 14px;
      color: #475569;
      line-height: 1.6;
      cursor: pointer;
    }
    .buttons {
      display: flex;
      gap: 12px;
    }
    .btn {
      flex: 1;
      padding: 16px 20px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: all 0.3s;
      font-family: inherit;
    }
    .btn-clear {
      background: #f1f5f9;
      color: #64748b;
    }
    .btn-clear:hover { background: #e2e8f0; }
    .btn-submit {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
      color: white;
    }
    .btn-submit:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(30,58,95,0.3); }
    .btn-submit:disabled {
      background: #cbd5e1;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .expiry {
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
      margin-top: 20px;
    }
    .loading {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .loading.show { display: flex; }
    .spinner {
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .success-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .success-overlay.show { display: flex; }
    .success-card {
      background: white;
      border-radius: 24px;
      padding: 50px 40px;
      text-align: center;
      max-width: 400px;
      margin: 20px;
      animation: popIn 0.5s ease-out;
    }
    @keyframes popIn {
      from { transform: scale(0.8); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .success-icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 25px;
    }
    .success-icon svg { width: 40px; height: 40px; color: white; }
    .success-card h2 { color: #10b981; font-size: 24px; margin-bottom: 10px; }
    .success-card p { color: #64748b; font-size: 16px; }
    .error-message {
      display: none;
      background: #fef2f2;
      color: #dc2626;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
      margin-bottom: 15px;
      text-align: center;
    }
    .error-message.show { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>بشير للتأمين</h1>
      <div class="english">BASHEER INSURANCE</div>
      <div class="welcome">مرحباً بك</div>
      <div class="client-name">${clientName}</div>
    </div>
    
    <div class="content">
      ${policySection}
      
      <div class="signature-section">
        <h3>يرجى التوقيع في المربع أدناه</h3>
        <div class="canvas-wrapper" id="canvasWrapper">
          <canvas id="signatureCanvas"></canvas>
          <span class="canvas-hint" id="canvasHint">ارسم توقيعك هنا</span>
        </div>
      </div>

      <div class="error-message" id="errorMessage"></div>

      <div class="checkbox-wrapper" onclick="document.getElementById('acceptTerms').click()">
        <input type="checkbox" id="acceptTerms">
        <label for="acceptTerms">أقرّ أنني قرأت وأوافق على جميع الشروط والأحكام المتعلقة بوثيقة التأمين</label>
      </div>

      <div class="buttons">
        <button class="btn btn-clear" onclick="clearCanvas()">مسح</button>
        <button class="btn btn-submit" id="submitBtn" onclick="submitSignature()" disabled>
          <span class="btn-text">تأكيد التوقيع</span>
          <span class="loading" id="loadingSpinner">
            <span class="spinner"></span>
            جاري الإرسال...
          </span>
        </button>
      </div>

      ${expiryText ? `<p class="expiry">ينتهي هذا الرابط في: ${expiryText}</p>` : ''}
    </div>
  </div>

  <div class="success-overlay" id="successOverlay">
    <div class="success-card">
      <div class="success-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2>تم التوقيع بنجاح</h2>
      <p>شكراً لك، تم حفظ توقيعك</p>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    const wrapper = document.getElementById('canvasWrapper');
    const hint = document.getElementById('canvasHint');
    const submitBtn = document.getElementById('submitBtn');
    const acceptTerms = document.getElementById('acceptTerms');
    const errorMessage = document.getElementById('errorMessage');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const btnText = document.querySelector('.btn-text');
    const successOverlay = document.getElementById('successOverlay');
    
    let isDrawing = false;
    let hasDrawn = false;
    
    // Set canvas size
    function resizeCanvas() {
      const rect = wrapper.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 200;
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x, y };
    }
    
    function startDrawing(e) {
      e.preventDefault();
      isDrawing = true;
      hasDrawn = true;
      hint.classList.add('hidden');
      wrapper.classList.add('active');
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      updateSubmitButton();
    }
    
    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    
    function stopDrawing() {
      isDrawing = false;
    }
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
    
    function clearCanvas() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
      hint.classList.remove('hidden');
      wrapper.classList.remove('active');
      updateSubmitButton();
    }
    
    function updateSubmitButton() {
      submitBtn.disabled = !hasDrawn || !acceptTerms.checked;
    }
    
    acceptTerms.addEventListener('change', updateSubmitButton);
    
    async function submitSignature() {
      if (!hasDrawn || !acceptTerms.checked) return;
      
      submitBtn.disabled = true;
      btnText.style.display = 'none';
      loadingSpinner.classList.add('show');
      errorMessage.classList.remove('show');
      
      try {
        const signatureDataUrl = canvas.toDataURL('image/png');
        
        const response = await fetch('${supabaseUrl}/functions/v1/submit-signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: '${token}',
            signature_data_url: signatureDataUrl
          })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'فشل في إرسال التوقيع');
        }
        
        successOverlay.classList.add('show');
        
      } catch (error) {
        errorMessage.textContent = error.message || 'حدث خطأ، يرجى المحاولة مرة أخرى';
        errorMessage.classList.add('show');
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        loadingSpinner.classList.remove('show');
      }
    }
  </script>
</body>
</html>`;
}
