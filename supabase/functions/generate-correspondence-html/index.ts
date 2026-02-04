import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { letter_id } = await req.json();
    
    if (!letter_id) {
      return new Response(JSON.stringify({ error: 'letter_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Generating HTML for letter:', letter_id);

    // Fetch letter data
    const { data: letter, error: letterError } = await supabase
      .from('correspondence_letters')
      .select('*')
      .eq('id', letter_id)
      .single();

    if (letterError || !letter) {
      console.error('Letter not found:', letterError);
      return new Response(JSON.stringify({ error: 'Letter not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch company info from sms_settings
    const { data: smsSettings } = await supabase
      .from('sms_settings')
      .select('company_phone_links, company_location')
      .limit(1)
      .single();

    // Parse phone links
    let phoneLinks: { phone: string; label?: string }[] = [];
    if (smsSettings?.company_phone_links) {
      try {
        phoneLinks = typeof smsSettings.company_phone_links === 'string'
          ? JSON.parse(smsSettings.company_phone_links)
          : smsSettings.company_phone_links;
      } catch {
        phoneLinks = [];
      }
    }

    const companyName = 'AB تأمين';
    const companyLocation = smsSettings?.company_location || '';
    const logoUrl = 'https://cdn.basheer-ab.com/assets/ab-insurance-logo.png';
    
    // Format date
    const letterDate = new Date(letter.created_at).toLocaleDateString('en-GB');

    // Build phone links for header
    const phonesHeaderHtml = phoneLinks.map(p => {
      const label = p.label ? `${p.label}: ` : '';
      return `<div>${label}${p.phone}</div>`;
    }).join('');

    // Build phone links for footer
    const phonesFooterHtml = phoneLinks.map((p, i) => {
      const label = p.label ? `${p.label}: ` : '';
      const separator = i > 0 ? ' | ' : '';
      return `${separator}${label}${p.phone}`;
    }).join('');

    // Build complete HTML with professional design
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${letter.title} - ${companyName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Tahoma, sans-serif;
      line-height: 1.8;
      background: #f1f5f9;
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
      padding: 24px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: white;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-logo {
      height: 70px;
      width: auto;
      border-radius: 12px;
    }
    .header-brand h1 {
      font-size: 24px;
      font-weight: bold;
      margin: 0;
    }
    .header-brand p {
      font-size: 14px;
      margin: 4px 0 0;
      opacity: 0.9;
    }
    .header-contact {
      text-align: left;
      font-size: 13px;
      line-height: 1.6;
    }
    .letter-title {
      text-align: center;
      padding: 24px 40px 16px;
      border-bottom: 2px solid #0d9488;
      margin: 0 40px;
    }
    .letter-title h2 {
      font-size: 22px;
      font-weight: bold;
      color: #0d9488;
      margin: 0;
    }
    .letter-meta {
      padding: 24px 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      background: #f8fafc;
    }
    .meta-item {
      display: flex;
      gap: 8px;
    }
    .meta-item.full {
      grid-column: span 2;
    }
    .meta-label {
      color: #64748b;
      font-weight: 600;
    }
    .meta-value {
      color: #1e293b;
    }
    .meta-value.bold {
      font-weight: 600;
    }
    .decorative-line {
      height: 4px;
      background: linear-gradient(90deg, #0d9488 0%, #14b8a6 50%, #0d9488 100%);
    }
    .content {
      padding: 32px 40px;
      min-height: 250px;
      font-size: 14px;
      line-height: 2.2;
      color: #1e293b;
    }
    .content img {
      max-width: 100%;
      height: auto;
      margin: 10px 0;
    }
    .greeting {
      margin-bottom: 16px;
      font-weight: 600;
    }
    .closing {
      margin-top: 32px;
    }
    .signature-area {
      padding: 24px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .signature-line {
      width: 150px;
      border-top: 2px solid #cbd5e1;
      padding-top: 8px;
      color: #64748b;
      font-size: 13px;
      text-align: center;
    }
    .signature-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      opacity: 0.7;
    }
    .signature-brand img {
      height: 40px;
      width: auto;
      border-radius: 8px;
    }
    .signature-brand span {
      font-size: 14px;
      color: #64748b;
      font-weight: 600;
    }
    .footer {
      background: #1e293b;
      padding: 16px 40px;
      text-align: center;
      color: white;
      font-size: 12px;
    }
    .footer-name {
      margin-bottom: 4px;
      font-weight: 600;
    }
    .footer-contact {
      opacity: 0.7;
    }
    @media print {
      body { 
        background: white; 
        padding: 0; 
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .container { 
        box-shadow: none; 
        max-width: 100%;
      }
      .header {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .decorative-line {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .footer {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
  <script>
    if (window.location.search.includes('print=1')) {
      window.onload = function() { setTimeout(function() { window.print(); }, 500); };
    }
  </script>
</head>
<body>
  <div class="container">
    <!-- Professional Header -->
    <div class="header">
      <div class="header-left">
        <img src="${logoUrl}" alt="${companyName}" class="header-logo" onerror="this.style.display='none'" />
        <div class="header-brand">
          <h1>${companyName}</h1>
          <p>وكالة تأمين معتمدة</p>
        </div>
      </div>
      <div class="header-contact">
        ${phonesHeaderHtml}
        ${companyLocation ? `<div style="opacity: 0.9">${companyLocation}</div>` : ''}
      </div>
    </div>

    <!-- Letter Title -->
    <div class="letter-title">
      <h2>${letter.title || 'رسالة رسمية'}</h2>
    </div>

    <!-- Letter Meta Info -->
    <div class="letter-meta">
      <div class="meta-item">
        <span class="meta-label">التاريخ:</span>
        <span class="meta-value">${letterDate}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">من:</span>
        <span class="meta-value">${companyName}</span>
      </div>
      <div class="meta-item full">
        <span class="meta-label">إلى:</span>
        <span class="meta-value bold">${letter.recipient_name || '---'}</span>
      </div>
    </div>

    <!-- Decorative Line -->
    <div class="decorative-line"></div>

    <!-- Body Content -->
    <div class="content">
      <p class="greeting">
        ${letter.recipient_name ? `حضرة السيد/ة ${letter.recipient_name} المحترم/ة،` : 'تحية طيبة وبعد،'}
      </p>
      
      ${letter.body_html || ''}
      
      <div class="closing">
        <p>وتفضلوا بقبول فائق الاحترام والتقدير،</p>
      </div>
    </div>

    <!-- Signature Area -->
    <div class="signature-area">
      <div class="signature-line">
        التوقيع والختم
      </div>
      <div class="signature-brand">
        <img src="${logoUrl}" alt="${companyName}" onerror="this.style.display='none'" />
        <span>${companyName}</span>
      </div>
    </div>

    <!-- Professional Footer -->
    <div class="footer">
      <div class="footer-name">${companyName} - وكالة تأمين معتمدة</div>
      <div class="footer-contact">
        ${phonesFooterHtml}${companyLocation ? ` | ${companyLocation}` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

    // Upload to BunnyCDN
    const bunnyStorageKey = Deno.env.get('BUNNY_API_KEY');
    const bunnyAccountKey = Deno.env.get('BUNNY_ACCOUNT_API_KEY'); // For CDN purge
    const bunnyStorageZone = Deno.env.get('BUNNY_STORAGE_ZONE') || 'basheer-ab';
    const bunnyCdnUrl = Deno.env.get('BUNNY_CDN_URL') || 'https://cdn.basheer-ab.com';

    if (!bunnyStorageKey) {
      console.error('BUNNY_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Storage not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fixed filename for stable URL
    const storagePath = `correspondence/${letter.id}/letter.html`;
    const uploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${storagePath}`;
    // Ensure CDN URL has the https:// prefix
    const cdnBaseUrl = bunnyCdnUrl.startsWith('http') ? bunnyCdnUrl : `https://${bunnyCdnUrl}`;
    const cdnUrl = `${cdnBaseUrl}/${storagePath}`;

    console.log('Uploading to:', uploadUrl);

    // Upload HTML
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': bunnyStorageKey,
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: html,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    console.log('Upload successful, purging cache...');

    // Purge CDN cache - requires Account API Key, not Storage Key
    if (bunnyAccountKey) {
      try {
        const purgeUrl = `https://api.bunny.net/purge?url=${encodeURIComponent(cdnUrl)}`;
        const purgeResponse = await fetch(purgeUrl, {
          method: 'POST',
          headers: { 'AccessKey': bunnyAccountKey },
        });
        if (purgeResponse.ok) {
          console.log('Cache purged successfully');
        } else {
          console.warn('CDN purge failed:', await purgeResponse.text());
        }
      } catch (purgeError) {
        console.error('Cache purge failed (non-fatal):', purgeError);
      }
    } else {
      console.warn('BUNNY_ACCOUNT_API_KEY not set - cache purge skipped');
    }

    // Update letter with generated URL
    await supabase
      .from('correspondence_letters')
      .update({ 
        generated_url: cdnUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', letter.id);

    console.log('Letter URL updated:', cdnUrl);

    return new Response(
      JSON.stringify({ success: true, url: cdnUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-correspondence-html:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
