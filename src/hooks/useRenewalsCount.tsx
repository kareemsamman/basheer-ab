import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRenewalsCount() {
  const [renewalsCount, setRenewalsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    try {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const [year, month] = currentMonth.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      // Use report_renewals with page_size=1 just to get total_count
      const { data, error } = await supabase.rpc('report_renewals', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_policy_type: null,
        p_created_by: null,
        p_search: null,
        p_page_size: 1,
        p_page: 1
      });

      if (error) {
        console.error('Error fetching renewals count:', error);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        setRenewalsCount((data[0] as any).total_count || 0);
      }
    } catch (err) {
      console.error('Unexpected error fetching renewals count:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    window.addEventListener('focus', fetchCount);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchCount);
    };
  }, [fetchCount]);

  return { renewalsCount, isLoading };
}
