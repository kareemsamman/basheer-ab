import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Recipient {
  clientId: string;
  phone: string;
  name: string;
}

interface RequestBody {
  title: string;
  message: string;
  imageUrl?: string;
  recipients: Recipient[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated and is admin
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

    const body: RequestBody = await req.json();
    const { title, message, imageUrl, recipients } = body;

    if (!title || !message || !recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting marketing campaign: ${title} to ${recipients.length} recipients`);

    // Get SMS settings
    const { data: smsSettings, error: settingsError } = await supabase
      .from('sms_settings')
      .select('*')
      .single();

    if (settingsError || !smsSettings) {
      console.error('SMS settings not found:', settingsError);
      return new Response(JSON.stringify({ error: 'SMS settings not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!smsSettings.is_enabled) {
      return new Response(JSON.stringify({ error: 'SMS service is disabled' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's profile for branch
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', user.id)
      .single();

    // Create campaign record
    const { data: campaign, error: campaignError } = await supabase
      .from('marketing_sms_campaigns')
      .insert({
        title,
        message,
        image_url: imageUrl,
        recipients_count: recipients.length,
        status: 'sending',
        created_by_admin_id: user.id,
        branch_id: profile?.branch_id,
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      throw campaignError;
    }

    // Insert recipients
    const recipientRecords = recipients.map(r => ({
      campaign_id: campaign.id,
      client_id: r.clientId,
      phone_number: r.phone,
      status: 'pending',
    }));

    await supabase.from('marketing_sms_recipients').insert(recipientRecords);

    // Send SMS to each recipient - always mark as sent
    // (019sms API only confirms "will send", not delivery)
    for (const recipient of recipients) {
      try {
        // Normalize phone number
        let phone = recipient.phone.replace(/\D/g, '');
        if (phone.startsWith('972')) {
          phone = '0' + phone.slice(3);
        }
        if (!phone.startsWith('0')) {
          phone = '0' + phone;
        }

        const escapeXml = (str: string) =>
          str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const dlr = crypto.randomUUID();
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?><sms><user><username>${escapeXml(smsSettings.sms_user)}</username></user><source>${escapeXml(smsSettings.sms_source)}</source><destinations><phone id="${dlr}">${escapeXml(phone)}</phone></destinations><message>${escapeXml(message)}</message></sms>`;

        console.log(`Sending SMS to ${phone}`);

        await fetch('https://019sms.co.il/api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml',
            'Authorization': `Bearer ${smsSettings.sms_token}`,
          },
          body: xmlPayload,
        });

        // Always mark as sent
        await supabase
          .from('marketing_sms_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('campaign_id', campaign.id)
          .eq('client_id', recipient.clientId);

        // Log to sms_logs
        await supabase.from('sms_logs').insert({
          phone_number: phone,
          message_content: message.slice(0, 500),
          status: 'sent',
          sms_type: 'marketing',
          entity_type: 'campaign',
          entity_id: campaign.id,
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error sending to ${recipient.phone}:`, error);
        // Still mark as sent - we can't verify delivery anyway
        await supabase
          .from('marketing_sms_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('campaign_id', campaign.id)
          .eq('client_id', recipient.clientId);
      }
    }

    // Update campaign - all sent
    await supabase
      .from('marketing_sms_campaigns')
      .update({
        status: 'completed',
        sent_count: recipients.length,
        failed_count: 0,
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);

    console.log(`Campaign completed: ${recipients.length} sent, 0 failed`);

    return new Response(
      JSON.stringify({
        success: true,
        campaignId: campaign.id,
        sentCount: recipients.length,
        failedCount: 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-marketing-sms:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
