import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Download, Wallet, FileText, ChevronLeft, Calendar, RotateCcw, AlertCircle, Printer, AlertTriangle, Eye, Pencil, Search, Receipt, Loader2, RefreshCw, Plus, Trash2, Copy } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { POLICY_TYPE_LABELS, getInsuranceTypeBadgeClass, POLICY_CHILD_LABELS } from '@/lib/insuranceTypes';
import { recalculatePolicyProfit } from '@/lib/pricingCalculator';
import { SupplementFormDialog } from '@/components/reports/SupplementFormDialog';
import { CalculationExplanationModal } from '@/components/reports/CalculationExplanationModal';
import { PolicyDetailsDrawer } from '@/components/policies/PolicyDetailsDrawer';
import { MultiSelectFilter } from '@/components/shared/MultiSelectFilter';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Broker = Tables<'brokers'>;

interface CompanySettlementData {
  company_id: string;
  company_name: string;
  company_name_ar: string | null;
  policy_count: number;
  total_insurance_price: number;
  total_company_payment: number;
}

interface CompanyOption {
  company_id: string;
  company_name: string;
  company_name_ar: string | null;
}

interface PolicyWithoutCompany {
  id: string;
  policy_type_parent: Enums<'policy_type_parent'>;
  policy_type_child: Enums<'policy_type_child'> | null;
  insurance_price: number;
  start_date: string;
  cancelled: boolean | null;
  client_name: string | null;
  car_number: string | null;
}

interface BrokerPolicyDetail {
  id: string;
  policy_type_parent: Enums<'policy_type_parent'>;
  policy_type_child: Enums<'policy_type_child'> | null;
  insurance_price: number;
  payed_for_company: number | null;
  profit: number | null;
  start_date: string;
  end_date: string;
  issue_date: string | null;
  cancelled: boolean | null;
  transferred: boolean | null;
  client_name: string | null;
  car_number: string | null;
  company_id: string | null;
  company_name: string | null;
  company_name_ar: string | null;
}

export default function CompanySettlement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompanySettlementData[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [filteredCompanies, setFilteredCompanies] = useState<CompanyOption[]>([]);
  
  // Policies without company
  const [policiesWithoutCompany, setPoliciesWithoutCompany] = useState<PolicyWithoutCompany[]>([]);
  const [loadingNoCompany, setLoadingNoCompany] = useState(false);
  const [activeTab, setActiveTab] = useState('with-company');
  
  // Policy details drawer
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  
  // Calculation explanation modal
  const [calculationModalOpen, setCalculationModalOpen] = useState(false);
  const [selectedPolicyForCalc, setSelectedPolicyForCalc] = useState<any>(null);
  const [selectedCompanyForCalc, setSelectedCompanyForCalc] = useState<any>(null);
  
  // Tax invoice
  const [profitPercent, setProfitPercent] = useState(10);
  const [generatingTaxInvoice, setGeneratingTaxInvoice] = useState(false);
  const [showTaxInvoicePopover, setShowTaxInvoicePopover] = useState(false);
  
  // Filters - date range instead of month
  const [showAllTime, setShowAllTime] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
  const [includeCancelled, setIncludeCancelled] = useState(false);

  // Broker detail view
  const [brokerPolicies, setBrokerPolicies] = useState<BrokerPolicyDetail[]>([]);
  const [loadingBrokerPolicies, setLoadingBrokerPolicies] = useState(false);

  // Recalculate profits
  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState({ current: 0, total: 0 });

  // PDF report
  const [generatingReport, setGeneratingReport] = useState(false);

  // Supplements
  const [showSupplementForm, setShowSupplementForm] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState<any>(null);
  const [supplements, setSupplements] = useState<any[]>([]);

  const isBrokerFiltered = selectedBrokers.length > 0;
  // Show flat policy table when any filter is active (not just broker)
  const isDetailMode = !showAllTime || selectedCompanies.length > 0 || selectedCategories.length > 0 || selectedBrokers.length > 0;

  // Summary totals
  const [summary, setSummary] = useState({
    totalPolicies: 0,
    totalInsurancePrice: 0,
    totalCompanyPayment: 0,
  });

  // Detail mode summary (policies flat view)
  const brokerSummary = useMemo(() => {
    if (!isDetailMode) return null;
    const filtered = brokerPolicies.filter(p => {
      if (!includeCancelled && p.cancelled) return false;
      return true;
    });
    // Exclude ELZAMI from totals
    const settlement = filtered.filter(p => p.policy_type_parent !== 'ELZAMI');
    return settlement.reduce((acc, p) => {
      const isTransferred = p.transferred === true;
      return {
        totalPolicies: acc.totalPolicies + 1,
        totalInsurancePrice: acc.totalInsurancePrice + (Number(p.insurance_price) || 0),
        totalCompanyPayment: acc.totalCompanyPayment + (isTransferred ? 0 : (Number(p.payed_for_company) || 0)),
        totalProfit: acc.totalProfit + (isTransferred ? 0 : (Number(p.profit) || 0)),
      };
    }, { totalPolicies: 0, totalInsurancePrice: 0, totalCompanyPayment: 0, totalProfit: 0 });
  }, [brokerPolicies, includeCancelled, isDetailMode]);

  useEffect(() => {
    fetchBrokers();
    fetchPoliciesWithoutCompany();
  }, []);

  useEffect(() => {
    fetchFilteredCompanies();
  }, [dateFrom, dateTo, selectedCategories, selectedBrokers, showAllTime]);

  useEffect(() => {
    if (isDetailMode) {
      fetchBrokerPolicies();
    } else {
      setBrokerPolicies([]);
      fetchSettlementData();
    }
  }, [dateFrom, dateTo, selectedCompanies, selectedCategories, selectedBrokers, includeCancelled, showAllTime]);

  const fetchBrokers = async () => {
    try {
      const { data: brokersData, error } = await supabase
        .from('brokers')
        .select('*')
        .order('name');

      if (error) throw error;
      setBrokers(brokersData || []);
    } catch (error) {
      console.error('Error fetching brokers:', error);
    }
  };

  const fetchPoliciesWithoutCompany = async () => {
    setLoadingNoCompany(true);
    try {
      const { data: policies, error } = await supabase
        .from('policies')
        .select(`
          id,
          policy_type_parent,
          policy_type_child,
          insurance_price,
          start_date,
          cancelled,
          clients (full_name),
          cars (car_number)
        `)
        .is('company_id', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const mapped: PolicyWithoutCompany[] = (policies || []).map((p: any) => ({
        id: p.id,
        policy_type_parent: p.policy_type_parent,
        policy_type_child: p.policy_type_child,
        insurance_price: p.insurance_price,
        start_date: p.start_date,
        cancelled: p.cancelled,
        client_name: p.clients?.full_name || null,
        car_number: p.cars?.car_number || null,
      }));

      setPoliciesWithoutCompany(mapped);
    } catch (error) {
      console.error('Error fetching policies without company:', error);
    } finally {
      setLoadingNoCompany(false);
    }
  };

  // Get date range based on current filter mode
  const getDateRange = () => {
    if (showAllTime) {
      return { startDate: '2026-01-01', endDate: null };
    }
    return { 
      startDate: dateFrom || '2026-01-01', 
      endDate: dateTo || null 
    };
  };

  // Fetch companies that have policies matching current filters (using RPC)
  const fetchFilteredCompanies = async () => {
    try {
      const { startDate, endDate } = getDateRange();

      const { data: companies, error } = await supabase.rpc('report_company_settlement_company_options', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_policy_type_parent: null,
        p_broker_id: null,
        p_policy_types: selectedCategories.length > 0 ? selectedCategories : null,
        p_broker_ids: selectedBrokers.length > 0 ? selectedBrokers : null,
      });

      if (error) throw error;

      const options: CompanyOption[] = (companies || []).map((c: any) => ({
        company_id: c.company_id,
        company_name: c.company_name,
        company_name_ar: c.company_name_ar,
      }));

      setFilteredCompanies(options);

      // Clear selected companies if they're no longer valid
      if (selectedCompanies.length > 0) {
        const validIds = new Set(options.map(c => c.company_id));
        const stillValid = selectedCompanies.filter(id => validIds.has(id));
        if (stillValid.length !== selectedCompanies.length) {
          setSelectedCompanies(stillValid);
        }
      }
    } catch (error) {
      console.error('Error fetching filtered companies:', error);
      setFilteredCompanies([]);
    }
  };

  const fetchSettlementData = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      const { data: result, error } = await supabase.rpc('report_company_settlement', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_company_id: null,
        p_policy_type_parent: null,
        p_broker_id: null,
        p_include_cancelled: includeCancelled,
        p_company_ids: selectedCompanies.length > 0 ? selectedCompanies : null,
        p_policy_types: selectedCategories.length > 0 ? selectedCategories : null,
        p_broker_ids: selectedBrokers.length > 0 ? selectedBrokers : null,
      });

      if (error) throw error;

      const mapped: CompanySettlementData[] = (result || []).map((r: any) => ({
        company_id: r.company_id,
        company_name: r.company_name,
        company_name_ar: r.company_name_ar,
        policy_count: Number(r.policy_count),
        total_insurance_price: Number(r.total_insurance_price),
        total_company_payment: Number(r.total_company_payment),
      }));

      setData(mapped);

      // Calculate summary
      const totals = mapped.reduce(
        (acc, item) => ({
          totalPolicies: acc.totalPolicies + item.policy_count,
          totalInsurancePrice: acc.totalInsurancePrice + item.total_insurance_price,
          totalCompanyPayment: acc.totalCompanyPayment + item.total_company_payment,
        }),
        { totalPolicies: 0, totalInsurancePrice: 0, totalCompanyPayment: 0 }
      );

      setSummary(totals);
    } catch (error) {
      console.error('Error fetching settlement data:', error);
      toast({
        title: 'خطأ',
        description: 'فشل في جلب بيانات التسوية',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch detailed policies when any filter is active (detail mode)
  const fetchBrokerPolicies = async () => {
    setLoadingBrokerPolicies(true);
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      let query = supabase
        .from('policies')
        .select(`
          id,
          policy_type_parent,
          policy_type_child,
          insurance_price,
          payed_for_company,
          profit,
          start_date,
          end_date,
          issue_date,
          cancelled,
          transferred,
          clients (full_name),
          cars (car_number),
          insurance_companies (name, name_ar)
        `)
        .is('deleted_at', null)
        .gte('issue_date', startDate);

      if (endDate) {
        query = query.lte('issue_date', endDate);
      }

      // Filter by broker - need to filter via clients.broker_id
      if (selectedBrokers.length === 1) {
        query = query.eq('broker_id', selectedBrokers[0]);
      } else if (selectedBrokers.length > 1) {
        query = query.in('broker_id', selectedBrokers);
      }

      if (selectedCompanies.length > 0) {
        query = query.in('company_id', selectedCompanies);
      }

      if (selectedCategories.length > 0) {
        query = query.in('policy_type_parent', selectedCategories as Enums<'policy_type_parent'>[]);
      }

      if (!includeCancelled) {
        query = query.or('cancelled.is.null,cancelled.eq.false');
      }

      const { data: policiesData, error } = await query.order('issue_date', { ascending: true });

      if (error) throw error;

      const mapped: BrokerPolicyDetail[] = (policiesData || []).map((p: any) => ({
        id: p.id,
        policy_type_parent: p.policy_type_parent,
        policy_type_child: p.policy_type_child,
        insurance_price: p.insurance_price,
        payed_for_company: p.payed_for_company,
        profit: p.profit,
        start_date: p.start_date,
        end_date: p.end_date,
        issue_date: p.issue_date,
        cancelled: p.cancelled,
        transferred: p.transferred,
        client_name: p.clients?.full_name || null,
        car_number: p.cars?.car_number || null,
        company_name: p.insurance_companies?.name || null,
        company_name_ar: p.insurance_companies?.name_ar || null,
        company_id: p.company_id || null,
      }));

      setBrokerPolicies(mapped);

      // Update summary from broker policies (excluding ELZAMI)
      const settlement = mapped.filter(p => p.policy_type_parent !== 'ELZAMI');
      const totals = settlement.reduce(
        (acc, p) => {
          const isTransferred = p.transferred === true;
          return {
            totalPolicies: acc.totalPolicies + 1,
            totalInsurancePrice: acc.totalInsurancePrice + (Number(p.insurance_price) || 0),
            totalCompanyPayment: acc.totalCompanyPayment + (isTransferred ? 0 : (Number(p.payed_for_company) || 0)),
          };
        },
        { totalPolicies: 0, totalInsurancePrice: 0, totalCompanyPayment: 0 }
      );
      setSummary(totals);
    } catch (error) {
      console.error('Error fetching broker policies:', error);
      toast({
        title: 'خطأ',
        description: 'فشل في جلب بيانات الوسيط',
        variant: 'destructive',
      });
    } finally {
      setLoadingBrokerPolicies(false);
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedCompanies([]);
    setSelectedCategories([]);
    setSelectedBrokers([]);
    setIncludeCancelled(false);
    setShowAllTime(true);
  };

  const exportToCSV = () => {
    if (isDetailMode) {
      // Detailed export
      const headers = ['العميل', 'رقم السيارة', 'نوع التأمين', 'الشركة', 'تاريخ البداية', 'تاريخ النهاية', 'المحصل', 'المستحق للشركة', 'الربح'];
      const rows = brokerPolicies.map(p => [
        p.client_name || '',
        p.car_number || '',
        getInsuranceTypeLabelBroker(p),
        p.company_name_ar || p.company_name || '',
        p.start_date,
        p.end_date,
        p.insurance_price,
        p.payed_for_company || 0,
        p.profit || 0,
      ]);
      const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `broker-settlement-detail.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['الشركة', 'عدد الوثائق', 'إجمالي المحصل', 'المستحق للشركة'];
      const rows = data.map(item => [
        item.company_name_ar || item.company_name,
        item.policy_count,
        item.total_insurance_price,
        item.total_company_payment,
      ]);
      const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `company-settlement${showAllTime ? '-all-time' : ''}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const getInsuranceTypeLabelLocal = (policy: PolicyWithoutCompany) => {
    if (policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child) {
      return POLICY_CHILD_LABELS[policy.policy_type_child] || policy.policy_type_child;
    }
    return POLICY_TYPE_LABELS[policy.policy_type_parent];
  };

  const getInsuranceTypeLabelBroker = (policy: BrokerPolicyDetail) => {
    if (policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child) {
      return POLICY_CHILD_LABELS[policy.policy_type_child] || policy.policy_type_child;
    }
    return POLICY_TYPE_LABELS[policy.policy_type_parent] || policy.policy_type_parent || '';
  };

  const handleViewPolicy = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setDetailsDrawerOpen(true);
  };

  const handleShowCalculation = async (policy: BrokerPolicyDetail) => {
    // Fetch full policy data for the calculation modal
    const { data: policyData } = await supabase
      .from('policies')
      .select(`
        id, policy_type_parent, policy_type_child, insurance_price, payed_for_company, profit,
        clients!inner(less_than_24),
        cars(id, car_number, car_type, car_value, year)
      `)
      .eq('id', policy.id)
      .single();

    if (policyData) {
      setSelectedPolicyForCalc({
        id: policyData.id,
        policy_type_parent: policyData.policy_type_parent,
        policy_type_child: policyData.policy_type_child,
        insurance_price: policyData.insurance_price,
        payed_for_company: policyData.payed_for_company,
        profit: policyData.profit,
        is_under_24: policyData.clients?.less_than_24,
        car: policyData.cars,
      });
      setSelectedCompanyForCalc({
        id: policy.company_id || '',
        name: policy.company_name || '',
        name_ar: policy.company_name_ar || null,
      });
      setCalculationModalOpen(true);
    }
  };

  const handlePolicyUpdated = () => {
    if (isDetailMode) {
      fetchBrokerPolicies();
    } else {
      fetchSettlementData();
    }
    fetchPoliciesWithoutCompany();
  };

  const handleRecalculateProfits = async () => {
    const eligible = brokerPolicies.filter(p => !p.cancelled && !p.transferred);
    if (eligible.length === 0) return;
    setRecalculating(true);
    setRecalcProgress({ current: 0, total: eligible.length });
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < eligible.length; i++) {
      try {
        await recalculatePolicyProfit(eligible[i].id);
        successCount++;
      } catch {
        failCount++;
      }
      setRecalcProgress({ current: i + 1, total: eligible.length });
    }
    setRecalculating(false);
    toast({ title: `تم إعادة احتساب ${successCount} وثيقة${failCount > 0 ? ` (${failCount} فشل)` : ''}` });
    fetchBrokerPolicies();
  };

  const handleGenerateReport = async () => {
    if (selectedCompanies.length !== 1) return;
    setGeneratingReport(true);
    try {
      const { startDate, endDate } = getDateRange();
      const { data, error } = await supabase.functions.invoke('generate-settlement-report', {
        body: {
          company_id: selectedCompanies[0],
          start_date: showAllTime ? null : startDate,
          end_date: showAllTime ? null : endDate,
          policy_type: selectedCategories.length === 1 ? selectedCategories[0] : null,
          include_cancelled: includeCancelled,
        },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
      toast({ title: 'تم إنشاء التقرير' });
    } catch {
      toast({ title: 'خطأ', description: 'فشل في إنشاء التقرير', variant: 'destructive' });
    } finally {
      setGeneratingReport(false);
    }
  };

  const fetchSupplements = async () => {
    if (selectedCompanies.length !== 1) { setSupplements([]); return; }
    const { startDate, endDate } = getDateRange();
    let query = supabase.from('settlement_supplements').select('*').eq('company_id', selectedCompanies[0]);
    if (!showAllTime) {
      query = query.gte('settlement_date', startDate);
      if (endDate) query = query.lte('settlement_date', endDate);
    }
    const { data } = await query.order('created_at', { ascending: false });
    setSupplements(data || []);
  };

  const handleDeleteSupplement = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الملحق؟')) return;
    await supabase.from('settlement_supplements').delete().eq('id', id);
    toast({ title: 'تم حذف الملحق' });
    fetchSupplements();
  };

  const handleSupplementSaved = () => {
    setShowSupplementForm(false);
    setEditingSupplement(null);
    fetchSupplements();
    fetchBrokerPolicies();
  };

  // Fetch supplements when company filter changes
  useEffect(() => {
    if (isDetailMode && selectedCompanies.length === 1) {
      fetchSupplements();
    } else {
      setSupplements([]);
    }
  }, [selectedCompanies, dateFrom, dateTo, showAllTime, isDetailMode]);

  const handleGenerateTaxInvoice = async () => {
    setGeneratingTaxInvoice(true);
    try {
      const { startDate, endDate } = getDateRange();
      const response = await supabase.functions.invoke('generate-tax-invoice', {
        body: {
          company_ids: selectedCompanies.length > 0 ? selectedCompanies : null,
          start_date: startDate,
          end_date: endDate,
          policy_types: selectedCategories.length > 0 ? selectedCategories : null,
          broker_ids: selectedBrokers.length > 0 ? selectedBrokers : null,
          include_cancelled: includeCancelled,
          profit_percent: profitPercent,
        },
      });
      if (response.error) throw response.error;
      const result = response.data;
      if (result?.url) {
        window.open(result.url, '_blank');
      } else if (typeof result === 'string') {
        const blob = new Blob([result], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
      setShowTaxInvoicePopover(false);
      toast({ title: 'تم إنشاء الفاتورة الضريبية بنجاح' });
    } catch (error: any) {
      console.error('Error generating tax invoice:', error);
      toast({ title: 'خطأ', description: error.message || 'فشل في إنشاء الفاتورة', variant: 'destructive' });
    } finally {
      setGeneratingTaxInvoice(false);
    }
  };

  // Format the current filter description
  const getFilterDescription = () => {
    const parts: string[] = [];
    
    if (showAllTime) {
      parts.push('كل الفترات');
    } else {
      if (dateFrom && dateTo) {
        parts.push(`من ${formatDate(dateFrom)} إلى ${formatDate(dateTo)}`);
      } else if (dateFrom) {
        parts.push(`من ${formatDate(dateFrom)}`);
      } else if (dateTo) {
        parts.push(`حتى ${formatDate(dateTo)}`);
      }
    }

    if (!includeCancelled) {
      parts.push('بدون الملغية');
    }

    return parts.join(' • ');
  };

  const activeSummary = isDetailMode && brokerSummary ? brokerSummary : summary;

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <Building2 className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">غير مصرح</h2>
            <p className="text-muted-foreground">هذه الصفحة متاحة للمسؤولين فقط</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header
        title="كشوفات انتاج"
        subtitle="ملخص المبالغ المستحقة للشركات والأرباح"
      />

      <div className="p-6 space-y-6 print:p-0" dir="rtl">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="print:hidden">
          <TabsList>
            <TabsTrigger value="with-company" className="gap-2">
              <Building2 className="h-4 w-4" />
              الوثائق مع شركات ({activeSummary.totalPolicies.toLocaleString('en-US')})
            </TabsTrigger>
            <TabsTrigger value="no-company" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              بدون شركة ({policiesWithoutCompany.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="with-company" className="space-y-6 mt-6">
            {/* Filters + Actions */}
            <Card>
              <CardContent className="pt-5 pb-4 space-y-4">
                {/* Filters grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" dir="rtl">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">من تاريخ</Label>
                    <ArabicDatePicker
                      value={dateFrom}
                      onChange={(v) => { setDateFrom(v); if (v) setShowAllTime(false); }}
                      placeholder="DD/MM/YYYY"
                      compact
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
                    <ArabicDatePicker
                      value={dateTo}
                      onChange={(v) => { setDateTo(v); if (v) setShowAllTime(false); }}
                      placeholder="DD/MM/YYYY"
                      compact
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">الوسيط</Label>
                    <MultiSelectFilter
                      options={brokers.map((b) => ({ value: b.id, label: b.name }))}
                      selected={selectedBrokers}
                      onChange={setSelectedBrokers}
                      placeholder="جميع الوسطاء"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">الشركة</Label>
                    <MultiSelectFilter
                      options={filteredCompanies.map((c) => ({
                        value: c.company_id,
                        label: c.company_name_ar || c.company_name,
                      }))}
                      selected={selectedCompanies}
                      onChange={setSelectedCompanies}
                      placeholder={`جميع الشركات (${filteredCompanies.length})`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">نوع الوثيقة</Label>
                    <MultiSelectFilter
                      options={Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                      selected={selectedCategories}
                      onChange={setSelectedCategories}
                      placeholder="جميع الأنواع"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">الملغية</Label>
                    <Select
                      value={includeCancelled ? 'include' : 'exclude'}
                      onValueChange={(v) => setIncludeCancelled(v === 'include')}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="exclude">استبعاد الملغية</SelectItem>
                        <SelectItem value="include">تضمين الملغية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
                  {isDetailMode && selectedCompanies.length === 1 && (
                    <Button size="sm" onClick={handleGenerateReport} disabled={generatingReport} className="gap-1.5">
                      {generatingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      تقرير PDF
                    </Button>
                  )}

                  <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>

                  <Popover open={showTaxInvoicePopover} onOpenChange={setShowTaxInvoicePopover}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Receipt className="h-3.5 w-3.5" />
                        فاتورة ضريبية
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56">
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm">نسبة المربح %</h4>
                        <Input
                          type="number"
                          value={profitPercent}
                          onChange={(e) => setProfitPercent(Number(e.target.value))}
                          min={0}
                          max={100}
                          className="h-8"
                        />
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={generatingTaxInvoice}
                          onClick={() => handleGenerateTaxInvoice()}
                        >
                          {generatingTaxInvoice ? (
                            <><Loader2 className="h-4 w-4 animate-spin ml-2" />جاري الإنشاء...</>
                          ) : (
                            'إنشاء فاتورة'
                          )}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Button variant="ghost" size="sm" onClick={handleResetFilters} className="gap-1.5 text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" />
                    إعادة ضبط
                  </Button>

                  {isDetailMode && (
                    <div className="mr-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRecalculateProfits}
                        disabled={recalculating || brokerPolicies.filter(p => !p.cancelled && !p.transferred).length === 0}
                        className="gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        إعادة احتساب ({brokerPolicies.filter(p => !p.cancelled && !p.transferred).length})
                      </Button>
                    </div>
                  )}
                </div>

                {recalculating && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>جاري إعادة الاحتساب...</span>
                      <span>{recalcProgress.current} / {recalcProgress.total}</span>
                    </div>
                    <Progress value={(recalcProgress.current / recalcProgress.total) * 100} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className={cn("grid gap-4", isDetailMode ? "md:grid-cols-4" : "md:grid-cols-3")}>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">عدد الوثائق</p>
                      <p className="text-2xl font-bold">{activeSummary.totalPolicies.toLocaleString('en-US')}</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 p-3">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">إجمالي المحصل</p>
                      <p className="text-2xl font-bold">₪{activeSummary.totalInsurancePrice.toLocaleString('en-US')}</p>
                    </div>
                    <div className="rounded-xl bg-blue-500/10 p-3">
                      <Wallet className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">المستحق للشركات</p>
                      <p className="text-2xl font-bold text-destructive">₪{activeSummary.totalCompanyPayment.toLocaleString('en-US')}</p>
                    </div>
                    <div className="rounded-xl bg-destructive/10 p-3">
                      <Building2 className="h-6 w-6 text-destructive" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isDetailMode && brokerSummary && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">الربح</p>
                        <p className="text-2xl font-bold text-green-600">₪{brokerSummary.totalProfit.toLocaleString('en-US')}</p>
                      </div>
                      <div className="rounded-xl bg-green-500/10 p-3">
                        <Wallet className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Data Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle>
                    {isDetailMode ? 'تفاصيل الوثائق' : 'تفاصيل التسوية حسب الشركة'}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {isDetailMode && selectedCompanies.length === 1 && (
                      <Button size="sm" variant="outline" onClick={() => { setEditingSupplement(null); setShowSupplementForm(true); }}>
                        <Plus className="h-4 w-4 ml-1" />
                        ملحق
                      </Button>
                    )}
                    <div className="relative w-64">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={isDetailMode ? "بحث بالاسم أو رقم السيارة..." : "بحث باسم الشركة..."}
                        value={companySearch}
                        onChange={(e) => setCompanySearch(e.target.value)}
                        className="pr-10"
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-auto" style={{ maxHeight: '70vh' }}>
                  {isDetailMode ? (
                    /* Broker detail table */
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-right">رقم السيارة</TableHead>
                          <TableHead className="text-right">نوع التأمين</TableHead>
                          <TableHead className="text-right">الشركة</TableHead>
                          <TableHead className="text-right">تاريخ البداية</TableHead>
                          <TableHead className="text-right">تاريخ النهاية</TableHead>
                          <TableHead className="text-right">المحصل</TableHead>
                          <TableHead className="text-right">للشركة</TableHead>
                          <TableHead className="text-right">الربح</TableHead>
                          <TableHead className="text-right w-20">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading || loadingBrokerPolicies ? (
                          Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 10 }).map((_, j) => (
                                <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (() => {
                          const q = companySearch.toLowerCase().trim();
                          const filtered = q
                            ? brokerPolicies.filter(p =>
                                (p.client_name || '').toLowerCase().includes(q) ||
                                (p.car_number || '').includes(q) ||
                                (p.company_name_ar || '').includes(q) ||
                                (p.company_name || '').toLowerCase().includes(q)
                              )
                            : brokerPolicies;
                          
                          return filtered.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                لا توجد بيانات
                              </TableCell>
                            </TableRow>
                          ) : filtered.map((policy) => (
                            <TableRow
                              key={policy.id}
                              className={cn(
                                "cursor-pointer transition-colors hover:bg-secondary/50",
                                policy.cancelled && "opacity-50 line-through"
                              )}
                              onClick={() => handleViewPolicy(policy.id)}
                            >
                              <TableCell className="font-medium">{policy.client_name || '-'}</TableCell>
                              <TableCell className="font-mono"><bdi>{policy.car_number || '-'}</bdi></TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getInsuranceTypeBadgeClass(policy.policy_type_parent)}>
                                  {getInsuranceTypeLabelBroker(policy)}
                                </Badge>
                              </TableCell>
                              <TableCell>{policy.company_name_ar || policy.company_name || '-'}</TableCell>
                              <TableCell>{formatDate(policy.start_date)}</TableCell>
                              <TableCell>{formatDate(policy.end_date)}</TableCell>
                              <TableCell className="font-mono">₪{Number(policy.insurance_price).toLocaleString('en-US')}</TableCell>
                              <TableCell className="font-mono text-destructive">₪{Number(policy.payed_for_company || 0).toLocaleString('en-US')}</TableCell>
                              <TableCell className="font-mono text-green-600">₪{Number(policy.profit || 0).toLocaleString('en-US')}</TableCell>
                              <TableCell onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => handleShowCalculation(policy)} title="شرح الحسبة">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                        {/* Supplement rows */}
                        {supplements.map((s) => (
                          <TableRow key={`supp-${s.id}`} className={cn("border-amber-200", s.is_cancelled && "opacity-50 bg-muted/30", !s.is_cancelled && "bg-amber-50/50")}>
                            <TableCell className="font-medium">
                              {s.customer_name || <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">ملحق</Badge>}
                              {s.customer_name && <Badge variant="outline" className="mr-2 text-xs bg-amber-100 text-amber-800 border-amber-300">يدوي</Badge>}
                              {s.is_cancelled && <Badge variant="destructive" className="mr-2 text-xs">ملغية</Badge>}
                            </TableCell>
                            <TableCell className="font-mono"><bdi>{s.car_number || '-'}</bdi></TableCell>
                            <TableCell>
                              {s.policy_type ? <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">{s.policy_type}</Badge> : '-'}
                            </TableCell>
                            <TableCell>-</TableCell>
                            <TableCell>{s.start_date ? formatDate(s.start_date) : formatDate(s.settlement_date)}</TableCell>
                            <TableCell>{s.end_date ? formatDate(s.end_date) : '-'}</TableCell>
                            <TableCell className="font-mono">₪{Number(s.insurance_price).toLocaleString('en-US')}</TableCell>
                            <TableCell className="font-mono text-destructive">₪{Number(s.company_payment).toLocaleString('en-US')}</TableCell>
                            <TableCell className="font-mono text-green-600">₪{Number(s.profit).toLocaleString('en-US')}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => { setEditingSupplement(s); setShowSupplementForm(true); }} title="تعديل">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteSupplement(s.id)} title="حذف">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    /* Summary table (default) */
                    <Table>
                      <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">الشركة</TableHead>
                            <TableHead className="text-right">عدد الوثائق</TableHead>
                            <TableHead className="text-right">إجمالي المحصل</TableHead>
                            <TableHead className="text-right">المستحق للشركة</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                               <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                               </TableRow>
                            ))
                        ) : data.length === 0 ? (
                          <TableRow>
                             <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              لا توجد بيانات للفترة المحددة
                            </TableCell>
                          </TableRow>
                        ) : (() => {
                          const filtered = companySearch.trim()
                            ? data.filter(item => 
                                (item.company_name_ar || '').includes(companySearch) || 
                                item.company_name.toLowerCase().includes(companySearch.toLowerCase())
                              )
                            : data;
                          return filtered.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                لا توجد نتائج للبحث
                              </TableCell>
                            </TableRow>
                          ) : filtered.map((item, index) => (
                            <TableRow 
                              key={index}
                              onClick={() => navigate(`/reports/company-settlement/${item.company_id}`)}
                              className={cn(
                                "cursor-pointer transition-colors",
                                "hover:bg-secondary/50"
                              )}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {item.company_name_ar || item.company_name}
                                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </TableCell>
                              <TableCell>{item.policy_count.toLocaleString('en-US')}</TableCell>
                              <TableCell>₪{item.total_insurance_price.toLocaleString('en-US')}</TableCell>
                              <TableCell className="text-destructive font-medium">
                                ₪{item.total_company_payment.toLocaleString('en-US')}
                              </TableCell>
                             </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="no-company" className="space-y-6 mt-6">
            {/* Warning Banner */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-medium">وثائق بدون شركة تأمين</p>
                <p className="text-sm text-muted-foreground">
                  هذه الوثائق لم يتم تحديد شركة التأمين لها. يجب تحديث كل وثيقة وإضافة الشركة المناسبة.
                </p>
              </div>
            </div>

            {/* No Company Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  وثائق بدون شركة ({policiesWithoutCompany.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-right">السيارة</TableHead>
                        <TableHead className="text-right">نوع التأمين</TableHead>
                        <TableHead className="text-right">تاريخ البداية</TableHead>
                        <TableHead className="text-right">السعر</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingNoCompany ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 7 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : policiesWithoutCompany.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            لا توجد وثائق بدون شركة 🎉
                          </TableCell>
                        </TableRow>
                      ) : (
                        policiesWithoutCompany.map((policy) => (
                          <TableRow key={policy.id}>
                            <TableCell className="font-medium">
                              {policy.client_name || '-'}
                            </TableCell>
                            <TableCell className="font-mono">
                              <bdi>{policy.car_number || '-'}</bdi>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getInsuranceTypeBadgeClass(policy.policy_type_parent)}>
                                {getInsuranceTypeLabelLocal(policy)}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(policy.start_date)}</TableCell>
                            <TableCell className="font-mono">
                              ₪{Number(policy.insurance_price).toLocaleString('en-US')}
                            </TableCell>
                            <TableCell>
                              {policy.cancelled ? (
                                <Badge variant="destructive">ملغية</Badge>
                              ) : (
                                <Badge variant="secondary">نشطة</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewPolicy(policy.id)}
                                  title="عرض وتعديل"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Print-only content */}
        <div className="hidden print:block">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">كشوفات انتاج</h1>
            <p className="text-muted-foreground">{getFilterDescription()}</p>
          </div>

          {/* Summary for print */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border p-4 text-center">
              <p className="text-sm text-muted-foreground">عدد الوثائق</p>
              <p className="text-xl font-bold">{activeSummary.totalPolicies.toLocaleString('en-US')}</p>
            </div>
            <div className="border p-4 text-center">
              <p className="text-sm text-muted-foreground">إجمالي المحصل</p>
              <p className="text-xl font-bold">₪{activeSummary.totalInsurancePrice.toLocaleString('en-US')}</p>
            </div>
            <div className="border p-4 text-center">
              <p className="text-sm text-muted-foreground">المستحق للشركات</p>
              <p className="text-xl font-bold">₪{activeSummary.totalCompanyPayment.toLocaleString('en-US')}</p>
            </div>
          </div>

          {/* Table for print */}
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border p-2 text-right bg-muted">الشركة</th>
                <th className="border p-2 text-right bg-muted">عدد الوثائق</th>
                <th className="border p-2 text-right bg-muted">إجمالي المحصل</th>
                <th className="border p-2 text-right bg-muted">المستحق للشركة</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={index}>
                  <td className="border p-2">{item.company_name_ar || item.company_name}</td>
                  <td className="border p-2">{item.policy_count.toLocaleString('en-US')}</td>
                  <td className="border p-2">₪{item.total_insurance_price.toLocaleString('en-US')}</td>
                  <td className="border p-2">₪{item.total_company_payment.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Policy Details Drawer */}
      <PolicyDetailsDrawer
        open={detailsDrawerOpen}
        onOpenChange={setDetailsDrawerOpen}
        policyId={selectedPolicyId}
        onUpdated={handlePolicyUpdated}
        onViewRelatedPolicy={(newPolicyId) => {
          setSelectedPolicyId(newPolicyId);
        }}
      />

      {/* Supplement Form Dialog */}
      {selectedCompanies.length === 1 && (
        <SupplementFormDialog
          open={showSupplementForm}
          onOpenChange={setShowSupplementForm}
          editingSupplement={editingSupplement}
          companyId={selectedCompanies[0]}
          onSaved={handleSupplementSaved}
        />
      )}
    </MainLayout>
  );
}