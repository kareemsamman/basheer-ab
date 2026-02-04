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

    // Fetch company info from sms_settings with invoice_templates join
    const { data: smsSettings } = await supabase
      .from('sms_settings')
      .select(`
        company_phone_links,
        company_location,
        invoice_templates:default_signature_template_id (logo_url)
      `)
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

    const companyName = 'مكتب بشير للتأمين';
    const logoUrl = (smsSettings?.invoice_templates as any)?.logo_url || '';

    // Build phone links HTML
    const phonesHtml = phoneLinks.map(p => {
      const label = p.label ? `${p.label}: ` : '';
      return `<span>${label}${p.phone}</span>`;
    }).join(' | ');

    // Build complete HTML
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
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .header img {
      max-height: 80px;
      margin-bottom: 10px;
    }
    .logo-placeholder {
      width: 80px;
      height: 80px;
      background: #3b82f6;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 24px;
      margin-bottom: 10px;
    }
    .recipient {
      margin-top: 16px;
      font-size: 18px;
      font-weight: 600;
    }
    .content {
      min-height: 300px;
      line-height: 2;
    }
    .content img {
      max-width: 100%;
      height: auto;
      margin: 10px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
    .footer .company-name {
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; padding: 20px; }
    }
  </style>
  <script>
    if (window.location.search.includes('print=1')) {
      window.onload = function() { window.print(); };
    }
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoUrl 
        ? `<img src="${logoUrl}" alt="${companyName}" />`
        : `<div class="logo-placeholder">AB</div>`
      }
      ${letter.recipient_name 
        ? `<div class="recipient">إلى: ${letter.recipient_name}</div>`
        : ''
      }
    </div>
    
    <div class="content">
      ${letter.body_html || ''}
    </div>
    
    <div class="footer">
      <p class="company-name">${companyName}</p>
      ${phonesHtml ? `<p>${phonesHtml}</p>` : ''}
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
