import { supabase } from '@/integrations/supabase/client';
import type { Enums } from '@/integrations/supabase/types';

interface CalculateProfitParams {
  policyTypeParent: Enums<'policy_type_parent'>;
  policyTypeChild: Enums<'policy_type_child'> | null;
  companyId: string;
  carType: Enums<'car_type'>;
  ageBand: Enums<'age_band'>;
  carValue: number | null;
  carYear: number | null;
  insurancePrice: number;
}

interface ProfitResult {
  companyPayment: number;
  profit: number;
}

/**
 * Calculate company payment and profit based on pricing rules
 * Following the legacy WP calculation logic
 */
export async function calculatePolicyProfit(params: CalculateProfitParams): Promise<ProfitResult> {
  const {
    policyTypeParent,
    policyTypeChild,
    companyId,
    carType,
    ageBand,
    carValue,
    carYear,
    insurancePrice,
  } = params;

  // ELZAMI: No profit - company gets all
  if (policyTypeParent === 'ELZAMI') {
    return { companyPayment: insurancePrice, profit: 0 };
  }

  try {
    // Fetch relevant pricing rules for the company
    const { data: rules, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('company_id', companyId)
      .eq('policy_type_parent', policyTypeParent);

    if (error) throw error;

    const getRuleValue = (
      ruleType: Enums<'pricing_rule_type'>,
      matchCarType = true,
      matchAgeBand = true
    ): number => {
      const matchingRules = rules?.filter(r => {
        if (r.rule_type !== ruleType) return false;
        if (matchCarType && r.car_type && r.car_type !== carType) return false;
        if (matchAgeBand && r.age_band && r.age_band !== 'ANY' && r.age_band !== ageBand) return false;
        return true;
      }) || [];

      // Sort by specificity (exact match first)
      matchingRules.sort((a, b) => {
        const aScore = (a.car_type === carType ? 2 : 0) + (a.age_band === ageBand ? 1 : 0);
        const bScore = (b.car_type === carType ? 2 : 0) + (b.age_band === ageBand ? 1 : 0);
        return bScore - aScore;
      });

      return matchingRules[0]?.value ?? 0;
    };

    // ROAD_SERVICE calculation
    if (policyTypeParent === 'ROAD_SERVICE') {
      let basePrice = getRuleValue('ROAD_SERVICE_PRICE', false, true);
      if (basePrice === 0) {
        basePrice = getRuleValue('ROAD_SERVICE_BASE', false, true);
      }

      let extraOld = 0;
      if (carYear && carYear <= 2007) {
        extraOld = getRuleValue('ROAD_SERVICE_EXTRA_OLD_CAR', false, false);
      }

      const companyPayment = basePrice + extraOld;
      return { companyPayment, profit: insurancePrice - companyPayment };
    }

    // THIRD_FULL calculation
    if (policyTypeParent === 'THIRD_FULL') {
      const thirdPrice = getRuleValue('THIRD_PRICE', true, true);

      // THIRD only
      if (policyTypeChild === 'THIRD' || !policyTypeChild) {
        return { companyPayment: thirdPrice, profit: insurancePrice - thirdPrice };
      }

      // FULL calculation
      if (policyTypeChild === 'FULL') {
        // Get discount - this is a FIXED ₪ amount that REPLACES third_price, NOT a percentage
        const discount = getRuleValue('DISCOUNT', true, false);
        
        // If discount exists, use it as third_component; otherwise use thirdPrice
        let thirdComponent = thirdPrice;
        if (discount > 0) {
          thirdComponent = discount;  // FIXED: discount replaces third_price, not reduces it
        }

        // Get min price and full percent
        const minPrice = getRuleValue('MIN_PRICE', true, false);
        const fullPercent = getRuleValue('FULL_PERCENT', true, false);

        // Calculate full component
        let fullComponent = 0;
        if (carValue && carValue >= 60000) {
          fullComponent = carValue * (fullPercent / 100);
        } else {
          fullComponent = minPrice;
        }

        const companyPayment = fullComponent + thirdComponent;
        return { companyPayment, profit: insurancePrice - companyPayment };
      }
    }

    // ACCIDENT_FEE_EXEMPTION
    if (policyTypeParent === 'ACCIDENT_FEE_EXEMPTION') {
      const fixedPrice = getRuleValue('THIRD_PRICE', false, false);
      return { companyPayment: fixedPrice, profit: insurancePrice - fixedPrice };
    }

    // Default: assume all goes to company (safest default)
    return { companyPayment: insurancePrice, profit: 0 };
  } catch (error) {
    console.error('Error calculating profit:', error);
    // Return safe defaults on error
    return { companyPayment: insurancePrice, profit: 0 };
  }
}

/**
 * Recalculate profit for an existing policy (for migrations/fixes)
 */
export async function recalculatePolicyProfit(policyId: string): Promise<ProfitResult | null> {
  try {
    // Fetch policy with car data
    const { data: policy, error } = await supabase
      .from('policies')
      .select(`
        *,
        cars!inner (
          car_type,
          car_value,
          year
        ),
        clients!inner (
          less_than_24
        )
      `)
      .eq('id', policyId)
      .single();

    if (error || !policy) throw error;

    const ageBand: Enums<'age_band'> = policy.clients.less_than_24 ? 'UNDER_24' : 'UP_24';

    const result = await calculatePolicyProfit({
      policyTypeParent: policy.policy_type_parent,
      policyTypeChild: policy.policy_type_child,
      companyId: policy.company_id,
      carType: policy.cars.car_type || 'car',
      ageBand,
      carValue: policy.cars.car_value,
      carYear: policy.cars.year,
      insurancePrice: policy.insurance_price,
    });

    // Update the policy with new values
    await supabase
      .from('policies')
      .update({
        payed_for_company: result.companyPayment,
        profit: result.profit,
      })
      .eq('id', policyId);

    return result;
  } catch (error) {
    console.error('Error recalculating policy profit:', error);
    return null;
  }
}
