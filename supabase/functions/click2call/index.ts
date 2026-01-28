import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ success: false, message: 'غير مصرح' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, message: 'جلسة غير صالحة' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { phone_number, extension_number } = body;

    if (!phone_number) {
      return new Response(
        JSON.stringify({ success: false, message: 'رقم الهاتف مطلوب' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's extension from profile if not provided
    let extensionToUse = extension_number;
    if (!extensionToUse) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('pbx_extension')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        return new Response(
          JSON.stringify({ success: false, message: 'خطأ في جلب بيانات المستخدم' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      extensionToUse = profile?.pbx_extension;
    }

    if (!extensionToUse) {
      return new Response(
        JSON.stringify({ success: false, message: 'لم يتم تعيين رقم تحويلة لهذا المستخدم' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get PBX credentials from auth_settings table
    const { data: authSettings, error: authSettingsError } = await supabase
      .from('auth_settings')
      .select('ippbx_enabled, ippbx_token_id, ippbx_extension_password')
      .limit(1)
      .single();

    if (authSettingsError) {
      console.error('Auth settings fetch error:', authSettingsError);
      return new Response(
        JSON.stringify({ success: false, message: 'خطأ في جلب إعدادات الاتصال' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!authSettings?.ippbx_enabled) {
      return new Response(
        JSON.stringify({ success: false, message: 'خاصية الاتصال السريع غير مفعلة' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenId = authSettings.ippbx_token_id;
    const extensionPassword = authSettings.ippbx_extension_password;

    if (!tokenId || !extensionPassword) {
      console.error('Missing PBX credentials in auth_settings');
      return new Response(
        JSON.stringify({ success: false, message: 'لم يتم تكوين نظام الاتصال' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean phone number (remove dashes and spaces)
    const cleanPhone = phone_number.replace(/[-\s]/g, '');

    console.log(`Initiating call: ${extensionToUse} -> ${cleanPhone}`);

    // Call IPPBX API
    const pbxPayload = {
      token_id: tokenId,
      phone_number: cleanPhone,
      extension_number: extensionToUse,
      extension_password: extensionPassword,
    };

    const pbxResponse = await fetch(
      'https://master.ippbx.co.il/ippbx_api/v1.4/api/info/click2call',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pbxPayload),
      }
    );

    const pbxData = await pbxResponse.json().catch(() => ({}));
    console.log('PBX Response:', pbxData);

    if (pbxResponse.ok && pbxData?.status === 'SUCCESS') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'SUCCESS', 
          message: 'تم بدء الاتصال بنجاح' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: pbxData?.status || 'FAILED',
          message: pbxData?.message || 'فشل في بدء الاتصال' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Click2Call error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'حدث خطأ في الخادم' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
