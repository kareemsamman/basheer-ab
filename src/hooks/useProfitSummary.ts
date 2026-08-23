import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProfitSummary {
  todayProfit: number;
  monthProfit: number;
  yearProfit: number;
  totalCompanyPaymentDue: number;
  totalBrokerDebtOwed: number; // المستحق للوسطاء (ما ندين به للوسيط)
  totalBrokerDebtOwing: number; // المستحق من الوسطاء (ما يدين به الوسيط لنا)
  todayRevenue: number;
  monthRevenue: number;
  yearRevenue: number;
  // Breakdown for charts
  elzamiCommission: number;
  otherProfit: number;
  monthElzamiCommission: number;
  monthOtherProfit: number;
  // ELZAMI costs (new)
  totalElzamiCost: number;
  monthElzamiCost: number;
  todayElzamiCost: number;
  // Net profit (after ELZAMI costs)
  netProfit: number;
  monthNetProfit: number;
  todayNetProfit: number;
}

export function useProfitSummary() {
  const [summary, setSummary] = useState<ProfitSummary>({
    todayProfit: 0,
    monthProfit: 0,
    yearProfit: 0,
    totalCompanyPaymentDue: 0,
    totalBrokerDebtOwed: 0,
    totalBrokerDebtOwing: 0,
    todayRevenue: 0,
    monthRevenue: 0,
    yearRevenue: 0,
    elzamiCommission: 0,
    otherProfit: 0,
    monthElzamiCommission: 0,
    monthOtherProfit: 0,
    totalElzamiCost: 0,
    monthElzamiCost: 0,
    todayElzamiCost: 0,
    netProfit: 0,
    monthNetProfit: 0,
    todayNetProfit: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      // "اليوم" بالتوقيت المحلي (إسرائيل) وليس UTC — toISOString() بيرجّع تاريخ UTC
      // وبيسبب عدم تطابق بالأيام قريب من منتصف الليل
      const toLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const today = toLocalDateStr(now);
      // لازم تكون بالتوقيت المحلي كمان — toISOString() كان بيرجّع آخر يوم من الشهر/السنة
      // السابقة (إسرائيل UTC+2/+3) فبتتسرّب بوالص من الشهر اللي قبل
      const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      const yearStart = toLocalDateStr(new Date(now.getFullYear(), 0, 1));

      // Fetch all active policies for the year with profit data and policy type
      // Include company data to check if company is broker-linked
      //
      // مُرقّم (paginated) لتجاوز حدّ الـ1000 صف في PostgREST — بدونه كانت البوالص
      // الأحدث (يعني بوالص اليوم) بتنقطع من النتيجة وتظهر "أرباح اليوم" صفر
      // بينما جدول الإنتاج (RPC بيجمّع على السيرفر) بيعرض الأرقام الصحيحة.
      // نفس نمط الترقيم المستعمل في fetchCompanyDebts داخل Dashboard.tsx
      type PolicyRow = {
        start_date: string | null;
        created_at: string | null;
        profit: number | null;
        payed_for_company: number | null;
        insurance_price: number | null;
        policy_type_parent: string | null;
        elzami_cost: number | null;
        broker_id: string | null;
        broker_direction: string | null;
        broker_buy_price: number | null;
        company_id: string | null;
        insurance_companies: { broker_id: string | null } | null;
      };
      const policies: PolicyRow[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('policies')
          .select(`
            start_date,
            created_at,
            profit,
            payed_for_company,
            insurance_price,
            policy_type_parent,
            elzami_cost,
            broker_id,
            broker_direction,
            broker_buy_price,
            company_id,
            insurance_companies!policies_company_id_fkey(broker_id)
          `)
          .is('deleted_at', null)
          .eq('cancelled', false)
          // بوليصة انحطّت على النظام هالسنة بس سريانها بدأ السنة اللي قبل لازم تنحسب كمان،
          // لأنّ الأرباح بتتحسب حسب تاريخ الإدخال (created_at)
          .or(`start_date.gte.${yearStart},created_at.gte.${yearStart}`)
          // ترتيب ثابت ضروري مع range() وإلا ممكن يتكرّر أو ينقص صف بين الصفحات
          .order('created_at', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        const batch = (data || []) as unknown as PolicyRow[];
        policies.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      // Fetch broker settlements to calculate net broker debt
      const { data: brokerSettlements } = await supabase
        .from('broker_settlements')
        .select('direction, total_amount, status')
        .eq('status', 'completed')
        .gte('created_at', yearStart);

      let todayProfit = 0;
      let monthProfit = 0;
      let yearProfit = 0;
      let totalCompanyPaymentDue = 0;
      let totalBrokerDebtOwed = 0; // ما ندين به للوسيط (from_broker)
      let totalBrokerDebtOwing = 0; // ما يدين به الوسيط لنا (to_broker)
      let todayRevenue = 0;
      let monthRevenue = 0;
      let yearRevenue = 0;
      let elzamiCommission = 0;
      let otherProfit = 0;
      let monthElzamiCommission = 0;
      let monthOtherProfit = 0;
      let totalElzamiCost = 0;
      let monthElzamiCost = 0;
      let todayElzamiCost = 0;

      policies.forEach((policy) => {
        const isElzami = policy.policy_type_parent === 'ELZAMI';
        // الأرباح كلها (اليوم/الشهر/السنة) تُحسب حسب تاريخ إدخال البوليصة على النظام
        // (created_at) وليس تاريخ بدء سريانها (start_date) — هيك ما يظهر ربح قبل إدخال
        // أي معاملة، والفلاتر الثلاثة بتقيس نفس الشي
        const enteredOn = policy.created_at ? toLocalDateStr(new Date(policy.created_at)) : null;
        const enteredToday = enteredOn === today;
        const enteredThisMonth = enteredOn != null && enteredOn >= monthStart;
        const enteredThisYear = enteredOn != null && enteredOn >= yearStart;

        let policyProfit: number;
        let policyRevenue: number;
        
        if (isElzami) {
          // ELZAMI: العمولة هي تكلفة سالبة وليست ربحاً - نستخدم elzami_cost مباشرة من البوليصة
          const elzamiCost = Number(policy.elzami_cost) || 0;
          policyProfit = 0;  // لا ربح من الإلزامي
          policyRevenue = 0; // الإيراد لا يُحسب لأنه يذهب للشركة
          
          // تسجيل تكلفة الإلزامي (كقيمة موجبة للعرض، لكنها خصم)
          // مقيّدة بالسنة مثل yearProfit لأنّ netProfit = yearProfit - totalElzamiCost
          if (enteredThisYear) {
            totalElzamiCost += elzamiCost;
            elzamiCommission += elzamiCost; // للتوافق مع القديم
          }

          if (enteredThisMonth) {
            monthElzamiCost += elzamiCost;
            monthElzamiCommission += elzamiCost;
          }
          if (enteredToday) {
            todayElzamiCost += elzamiCost;
          }
        } else {
          policyProfit = Number(policy.profit) || 0;
          policyRevenue = Number(policy.insurance_price) || 0;
          
          // Only add to company payment due if company is NOT broker-linked
          const companyData = policy.insurance_companies as any;
          const isCompanyBrokerLinked = companyData?.broker_id != null;
          if (!isCompanyBrokerLinked) {
            totalCompanyPaymentDue += Number(policy.payed_for_company) || 0;
          }
          
          if (enteredThisYear) {
            otherProfit += policyProfit;
          }
          if (enteredThisMonth) {
            monthOtherProfit += policyProfit;
          }
          
          // Calculate broker debts
          if (policy.broker_id && policy.broker_buy_price) {
            const buyPrice = Number(policy.broker_buy_price) || 0;
            if (policy.broker_direction === 'from_broker') {
              // نشتري من الوسيط = ندين للوسيط
              totalBrokerDebtOwed += buyPrice;
            } else if (policy.broker_direction === 'to_broker') {
              // نبيع للوسيط = الوسيط يدين لنا بالربح
              totalBrokerDebtOwing += policyProfit;
            }
          }
        }

        if (enteredThisYear) {
          yearProfit += policyProfit;
          yearRevenue += policyRevenue;
        }

        if (enteredThisMonth) {
          monthProfit += policyProfit;
          monthRevenue += policyRevenue;
        }

        if (enteredToday) {
          todayProfit += policyProfit;
          todayRevenue += policyRevenue;
        }
      });

      // حساب صافي الربح بعد خصم تكلفة الإلزامي
      const netProfit = yearProfit - totalElzamiCost;
      const monthNetProfit = monthProfit - monthElzamiCost;
      const todayNetProfit = todayProfit - todayElzamiCost;

      // Adjust broker debts based on settlements
      brokerSettlements?.forEach((settlement) => {
        const amount = Number(settlement.total_amount) || 0;
        if (settlement.direction === 'to_broker') {
          // دفعنا للوسيط = نقص من ديننا
          totalBrokerDebtOwed -= amount;
        } else if (settlement.direction === 'from_broker') {
          // استلمنا من الوسيط = نقص من دينه علينا
          totalBrokerDebtOwing -= amount;
        }
      });

      setSummary({
        todayProfit,
        monthProfit,
        yearProfit,
        totalCompanyPaymentDue,
        totalBrokerDebtOwed: Math.max(0, totalBrokerDebtOwed),
        totalBrokerDebtOwing: Math.max(0, totalBrokerDebtOwing),
        todayRevenue,
        monthRevenue,
        yearRevenue,
        elzamiCommission,
        otherProfit,
        monthElzamiCommission,
        monthOtherProfit,
        totalElzamiCost,
        monthElzamiCost,
        todayElzamiCost,
        netProfit,
        monthNetProfit,
        todayNetProfit,
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
