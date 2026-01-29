import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPER_ADMIN_EMAIL = 'morshed500@gmail.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CRITICAL: Only super admin can delete policies
    if (user.email !== SUPER_ADMIN_EMAIL) {
      console.log(`Unauthorized delete attempt by: ${user.email}`);
      return new Response(JSON.stringify({ error: 'Only super admin can delete policies' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get policy ID(s) from request body
    const { policyIds } = await req.json();

    if (!policyIds || !Array.isArray(policyIds) || policyIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No policy IDs provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Super admin ${user.email} is deleting policies: ${policyIds.join(', ')}`);

    // For packages, get all related policies by group_id
    const allPolicyIds: string[] = [...policyIds];
    
    for (const policyId of policyIds) {
      const { data: policy } = await supabase
        .from('policies')
        .select('group_id')
        .eq('id', policyId)
        .single();
      
      if (policy?.group_id) {
        const { data: groupPolicies } = await supabase
          .from('policies')
          .select('id')
          .eq('group_id', policy.group_id);
        
        if (groupPolicies) {
          for (const gp of groupPolicies) {
            if (!allPolicyIds.includes(gp.id)) {
              allPolicyIds.push(gp.id);
            }
          }
        }
      }
    }

    console.log(`Total policies to delete (including package members): ${allPolicyIds.length}`);

    // Delete related data in correct order to avoid FK constraints

    // 1. Delete ledger entries
    const { error: ledgerError } = await supabase
      .from('ab_ledger')
      .delete()
      .in('policy_id', allPolicyIds);
    
    if (ledgerError) {
      console.error('Error deleting ledger entries:', ledgerError);
    } else {
      console.log('Deleted ledger entries');
    }

    // 2. Delete policy payments
    const { error: paymentsError } = await supabase
      .from('policy_payments')
      .delete()
      .in('policy_id', allPolicyIds);
    
    if (paymentsError) {
      console.error('Error deleting policy payments:', paymentsError);
    } else {
      console.log('Deleted policy payments');
    }

    // 3. Delete customer wallet transactions related to these policies
    const { error: walletError } = await supabase
      .from('customer_wallet_transactions')
      .delete()
      .in('policy_id', allPolicyIds);
    
    if (walletError) {
      console.error('Error deleting wallet transactions:', walletError);
    } else {
      console.log('Deleted wallet transactions');
    }

    // 4. Delete customer signatures
    const { error: signaturesError } = await supabase
      .from('customer_signatures')
      .delete()
      .in('policy_id', allPolicyIds);
    
    if (signaturesError) {
      console.error('Error deleting signatures:', signaturesError);
    } else {
      console.log('Deleted signatures');
    }

    // 5. Delete media files (soft delete)
    const { error: mediaError } = await supabase
      .from('media_files')
      .update({ deleted_at: new Date().toISOString() })
      .in('entity_id', allPolicyIds)
      .eq('entity_type', 'policy');
    
    if (mediaError) {
      console.error('Error deleting media files:', mediaError);
    } else {
      console.log('Soft-deleted media files');
    }

    // 6. Delete accident reports and third parties
    const { data: accidentReports } = await supabase
      .from('accident_reports')
      .select('id')
      .in('policy_id', allPolicyIds);
    
    if (accidentReports && accidentReports.length > 0) {
      const accidentIds = accidentReports.map(a => a.id);
      
      // Delete third parties first
      const { error: thirdPartiesError } = await supabase
        .from('accident_third_parties')
        .delete()
        .in('accident_report_id', accidentIds);
      
      if (thirdPartiesError) {
        console.error('Error deleting accident third parties:', thirdPartiesError);
      }
      
      // Delete accident reports
      const { error: accidentsError } = await supabase
        .from('accident_reports')
        .delete()
        .in('policy_id', allPolicyIds);
      
      if (accidentsError) {
        console.error('Error deleting accident reports:', accidentsError);
      } else {
        console.log('Deleted accident reports and third parties');
      }
    }

    // 7. Delete broker settlement items that reference these policies
    const { error: brokerSettlementItemsError } = await supabase
      .from('broker_settlement_items')
      .delete()
      .in('policy_id', allPolicyIds);
    
    if (brokerSettlementItemsError) {
      console.error('Error deleting broker settlement items:', brokerSettlementItemsError);
    } else {
      console.log('Deleted broker settlement items');
    }

    // 8. Finally, delete the policies themselves
    const { error: policiesError } = await supabase
      .from('policies')
      .delete()
      .in('id', allPolicyIds);
    
    if (policiesError) {
      console.error('Error deleting policies:', policiesError);
      return new Response(JSON.stringify({ 
        error: 'Failed to delete policies',
        details: policiesError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Successfully deleted ${allPolicyIds.length} policies and all related data`);

    return new Response(JSON.stringify({ 
      success: true, 
      deletedCount: allPolicyIds.length,
      deletedPolicyIds: allPolicyIds
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Delete policy error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
