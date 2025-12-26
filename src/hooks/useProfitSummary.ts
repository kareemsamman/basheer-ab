import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProfitSummary {
  todayProfit: number;
  monthProfit: number;
  yearProfit: number;
  totalCompanyPaymentDue: number;
  todayRevenue: number;
  monthRevenue: number;
  yearRevenue: number;
  // Breakdown for charts
  elzamiCommission: number;
  otherProfit: number;
  monthElzamiCommission: number;
  monthOtherProfit: number;
}

export function useProfitSummary() {
  const [summary, setSummary] = useState<ProfitSummary>({
    todayProfit: 0,
    monthProfit: 0,
    yearProfit: 0,
    totalCompanyPaymentDue: 0,
    todayRevenue: 0,
    monthRevenue: 0,
    yearRevenue: 0,
    elzamiCommission: 0,
    otherProfit: 0,
    monthElzamiCommission: 0,
    monthOtherProfit: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];

      // Fetch all active policies for the year with profit data and policy type
      const { data: policies, error } = await supabase
        .from('policies')
        .select(`
          start_date, 
          profit, 
          payed_for_company, 
          insurance_price,
          policy_type_parent,
          company_id
        `)
        .is('deleted_at', null)
        .eq('cancelled', false)
        .gte('start_date', yearStart);

      if (error) throw error;

      // Fetch ELZAMI companies with their commission (now category_parent is an array)
      const { data: elzamiCompanies, error: compError } = await supabase
        .from('insurance_companies')
        .select('id, elzami_commission')
        .contains('category_parent', ['ELZAMI']);

      if (compError) throw compError;

      // Create a map for quick lookup
      const elzamiCommissionMap = new Map<string, number>();
      elzamiCompanies?.forEach((comp: any) => {
        elzamiCommissionMap.set(comp.id, comp.elzami_commission || 0);
      });

      let todayProfit = 0;
      let monthProfit = 0;
      let yearProfit = 0;
      let totalCompanyPaymentDue = 0;
      let todayRevenue = 0;
      let monthRevenue = 0;
      let yearRevenue = 0;
      let elzamiCommission = 0;
      let otherProfit = 0;
      let monthElzamiCommission = 0;
      let monthOtherProfit = 0;

      policies?.forEach((policy) => {
        const isElzami = policy.policy_type_parent === 'ELZAMI';
        
        let policyProfit: number;
        let policyRevenue: number;
        
        if (isElzami) {
          const commission = policy.company_id ? (elzamiCommissionMap.get(policy.company_id) || 0) : 0;
          policyProfit = commission;
          policyRevenue = 0;
          elzamiCommission += commission;
          if (policy.start_date >= monthStart) {
            monthElzamiCommission += commission;
          }
        } else {
          policyProfit = Number(policy.profit) || 0;
          policyRevenue = Number(policy.insurance_price) || 0;
          totalCompanyPaymentDue += Number(policy.payed_for_company) || 0;
          otherProfit += policyProfit;
          if (policy.start_date >= monthStart) {
            monthOtherProfit += policyProfit;
          }
        }

        yearProfit += policyProfit;
        yearRevenue += policyRevenue;

        if (policy.start_date >= monthStart) {
          monthProfit += policyProfit;
          monthRevenue += policyRevenue;
        }

        if (policy.start_date === today) {
          todayProfit += policyProfit;
          todayRevenue += policyRevenue;
        }
      });

      setSummary({
        todayProfit,
        monthProfit,
        yearProfit,
        totalCompanyPaymentDue,
        todayRevenue,
        monthRevenue,
        yearRevenue,
        elzamiCommission,
        otherProfit,
        monthElzamiCommission,
        monthOtherProfit,
      });
    } catch (error) {
      console.error('Error fetching profit summary:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
}
