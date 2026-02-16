import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ArrowRight, Building2, Download, TrendingUp, Wallet, FileText, Calculator, Printer, Eye, Pencil, RotateCcw, Loader2, CreditCard, Plus, Search, ArrowUpDown, Check, X, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';
import { CalculationExplanationModal } from '@/components/reports/CalculationExplanationModal';
import { PolicyDetailsDrawer } from '@/components/policies/PolicyDetailsDrawer';
import { 
  POLICY_TYPE_LABELS, 
  POLICY_CHILD_LABELS, 
  getInsuranceTypeBadgeClass,
} from '@/lib/insuranceTypes';
import { cn } from '@/lib/utils';
import type { Enums } from '@/integrations/supabase/types';
import { toast } from 'sonner';

interface PolicyDetail {
  id: string;
  policy_type_parent: Enums<'policy_type_parent'>;
  policy_type_child: Enums<'policy_type_child'> | null;
  insurance_price: number;
  payed_for_company: number | null;
  profit: number | null;
  start_date: string;
  end_date: string;
  is_under_24: boolean | null;
  created_at: string;
  cancelled: boolean | null;
  transferred: boolean | null;
  transferred_to_car_number: string | null;
  client: {
    id: string;
    full_name: string;
  } | null;
  car: {
    id: string;
    car_number: string;
    car_type: Enums<'car_type'> | null;
    car_value: number | null;
    year: number | null;
    manufacturer_name: string | null;
  } | null;
  creator: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface CompanyInfo {
  id: string;
  name: string;
  name_ar: string | null;
}

interface CompanyCheque {
  id: string;
  amount: number;
  payment_date: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  client_name: string | null;
  car_number: string | null;
}

export default function CompanySettlementDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { toast: uiToast } = useToast();
  const { isAdmin } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [policies, setPolicies] = useState<PolicyDetail[]>([]);
  
  // Search & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(true); // default old to new
  
  // Inline edit
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ insurance_price: 0, payed_for_company: 0, profit: 0, car_value: 0 });
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Cheques
  const [companyCheques, setCompanyCheques] = useState<CompanyCheque[]>([]);
  const [loadingCheques, setLoadingCheques] = useState(false);
  
  // Calculation modal
  const [selectedPolicyForCalc, setSelectedPolicyForCalc] = useState<PolicyDetail | null>(null);
  const [calculationModalOpen, setCalculationModalOpen] = useState(false);
  
  // Policy details drawer
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  
  // Filters - default to all time
  const [showAllTime, setShowAllTime] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDay.toISOString().split('T')[0];
  });
  const [selectedPolicyType, setSelectedPolicyType] = useState<string>('all');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatingTaxInvoice, setGeneratingTaxInvoice] = useState(false);
  const [showTaxInvoiceInput, setShowTaxInvoiceInput] = useState(false);
  const [profitPercent, setProfitPercent] = useState(10);

  // Filtered data
  const filteredPolicies = useMemo(() => {
    let result = policies.filter(policy => {
      if (selectedPolicyType !== 'all' && policy.policy_type_parent !== selectedPolicyType) {
        return false;
      }
      if (!includeCancelled && policy.cancelled) {
        return false;
      }
      return true;
    });

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(policy => {
        const clientName = policy.client?.full_name?.toLowerCase() || '';
        const carNumber = policy.car?.car_number?.toLowerCase() || '';
        const manufacturer = policy.car?.manufacturer_name?.toLowerCase() || '';
        const insuranceLabel = getInsuranceTypeLabelLocal(policy).toLowerCase();
        const priceStr = String(policy.insurance_price);
        const companyPayStr = String(policy.payed_for_company || 0);
        const profitStr = String(policy.profit || 0);
        
        return clientName.includes(q) || carNumber.includes(q) || manufacturer.includes(q) ||
          insuranceLabel.includes(q) || priceStr.includes(q) || companyPayStr.includes(q) || profitStr.includes(q);
      });
    }

    // Sort by start_date
    result.sort((a, b) => {
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return sortAsc ? dateA - dateB : dateB - dateA;
    });

    return result;
  }, [policies, selectedPolicyType, includeCancelled, searchQuery, sortAsc]);

  // Summary totals
  const summary = useMemo(() => {
    return filteredPolicies.reduce(
      (acc, policy) => {
        const isTransferred = policy.transferred === true;
        return {
          totalPolicies: acc.totalPolicies + 1,
          totalInsurancePrice: acc.totalInsurancePrice + (Number(policy.insurance_price) || 0),
          totalCompanyPayment: acc.totalCompanyPayment + (isTransferred ? 0 : (Number(policy.payed_for_company) || 0)),
          totalProfit: acc.totalProfit + (isTransferred ? 0 : (Number(policy.profit) || 0)),
        };
      },
      { totalPolicies: 0, totalInsurancePrice: 0, totalCompanyPayment: 0, totalProfit: 0 }
    );
  }, [filteredPolicies]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (companyId) {
      fetchCompanyAndPolicies();
      fetchCompanyCheques();
    }
  }, [companyId, startDate, endDate, showAllTime]);

  const fetchCompanyAndPolicies = async () => {
    if (!companyId) return;
    
    setLoading(true);
    try {
      const { data: companyData, error: companyError } = await supabase
        .from('insurance_companies')
        .select('id, name, name_ar')
        .eq('id', companyId)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

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
          is_under_24,
          created_at,
          cancelled,
          transferred,
          transferred_to_car_number,
          created_by_admin_id,
          clients!inner (
            id,
            full_name
          ),
          cars (
            id,
            car_number,
            car_type,
            car_value,
            year,
            manufacturer_name
          ),
          profiles:created_by_admin_id (
            id,
            full_name,
            email
          )
        `)
        .eq('company_id', companyId)
        .is('deleted_at', null);

      if (!showAllTime) {
        query = query
          .gte('start_date', startDate)
          .lte('start_date', endDate);
      }

      const { data: policiesData, error: policiesError } = await query.order('created_at', { ascending: true });

      if (policiesError) throw policiesError;

      const mappedPolicies: PolicyDetail[] = (policiesData || []).map((p: any) => ({
        id: p.id,
        policy_type_parent: p.policy_type_parent,
        policy_type_child: p.policy_type_child,
        insurance_price: p.insurance_price,
        payed_for_company: p.payed_for_company,
        profit: p.profit,
        start_date: p.start_date,
        end_date: p.end_date,
        is_under_24: p.is_under_24,
        created_at: p.created_at,
        cancelled: p.cancelled,
        transferred: p.transferred,
        transferred_to_car_number: p.transferred_to_car_number,
        client: p.clients ? { id: p.clients.id, full_name: p.clients.full_name } : null,
        car: p.cars ? {
          id: p.cars.id,
          car_number: p.cars.car_number,
          car_type: p.cars.car_type,
          car_value: p.cars.car_value,
          year: p.cars.year,
          manufacturer_name: p.cars.manufacturer_name,
        } : null,
        creator: p.profiles ? {
          id: p.profiles.id,
          full_name: p.profiles.full_name,
          email: p.profiles.email,
        } : null,
      }));

      setPolicies(mappedPolicies);
    } catch (error) {
      console.error('Error fetching data:', error);
      uiToast({
        title: 'خطأ',
        description: 'فشل في جلب البيانات',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyCheques = async () => {
    if (!companyId) return;
    setLoadingCheques(true);
    try {
      const { data: cheques, error } = await supabase
        .from('policy_payments')
        .select('id, amount, payment_date, cheque_number, cheque_image_url, policy_id, policies(clients(full_name), cars(car_number))')
        .eq('transferred_to_type', 'company')
        .eq('transferred_to_id', companyId)
        .eq('cheque_status', 'transferred_out')
        .order('payment_date', { ascending: false });

      if (error) throw error;

      const mapped: CompanyCheque[] = (cheques || []).map((c: any) => ({
        id: c.id,
        amount: c.amount,
        payment_date: c.payment_date,
        cheque_number: c.cheque_number,
        cheque_image_url: c.cheque_image_url,
        client_name: c.policies?.clients?.full_name || null,
        car_number: c.policies?.cars?.car_number || null,
      }));

      setCompanyCheques(mapped);
    } catch (error) {
      console.error('Error fetching company cheques:', error);
    } finally {
      setLoadingCheques(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const getInsuranceTypeLabelLocal = (policy: PolicyDetail) => {
    if (policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child) {
      return POLICY_CHILD_LABELS[policy.policy_type_child] || policy.policy_type_child;
    }
    return POLICY_TYPE_LABELS[policy.policy_type_parent];
  };

  const getCarTypeLabel = (carType: string | null) => {
    const labels: Record<string, string> = {
      car: 'خصوصي',
      cargo: 'شحن',
      small: 'اوتوبس زعير',
      taxi: 'تاكسي',
      tjeradown4: 'تجاري < 4 طن',
      tjeraup4: 'تجاري > 4 طن',
    };
    return carType ? labels[carType] || carType : '-';
  };

  const isFullPolicy = (policy: PolicyDetail) => {
    return policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child === 'FULL';
  };

  // Inline edit handlers
  const handleStartEdit = (policy: PolicyDetail) => {
    setEditingPolicyId(policy.id);
    setEditValues({
      insurance_price: Number(policy.insurance_price) || 0,
      payed_for_company: Number(policy.payed_for_company) || 0,
      profit: Number(policy.profit) || 0,
      car_value: Number(policy.car?.car_value) || 0,
    });
  };

  const handleCancelEdit = () => {
    setEditingPolicyId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingPolicyId) return;
    setSavingEdit(true);
    
    const editedPolicy = policies.find(p => p.id === editingPolicyId);
    
    try {
      // Optimistic update
      setPolicies(prev => prev.map(p => 
        p.id === editingPolicyId 
          ? { 
              ...p, 
              insurance_price: editValues.insurance_price, 
              payed_for_company: editValues.payed_for_company, 
              profit: editValues.profit,
              car: p.car ? { ...p.car, car_value: editValues.car_value } : p.car,
            } 
          : p
      ));
      
      const savedEditingId = editingPolicyId;
      setEditingPolicyId(null);

      // Update policy in background
      const { error } = await supabase
        .from('policies')
        .update({
          insurance_price: editValues.insurance_price,
          payed_for_company: editValues.payed_for_company,
          profit: editValues.profit,
        })
        .eq('id', savedEditingId);

      if (error) throw error;

      // Update car_value if car exists
      if (editedPolicy?.car?.id) {
        const { error: carError } = await supabase
          .from('cars')
          .update({ car_value: editValues.car_value })
          .eq('id', editedPolicy.car.id);
        
        if (carError) throw carError;
      }

      toast.success('تم تحديث البوليصة بنجاح');
    } catch (error) {
      console.error('Error saving edit:', error);
      toast.error('فشل في حفظ التعديلات');
      // Revert on error
      fetchCompanyAndPolicies();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResetFilters = () => {
    setShowAllTime(true);
    setSelectedPolicyType('all');
    setIncludeCancelled(false);
    setSearchQuery('');
  };

  const exportToCSV = () => {
    const headers = [
      'رقم الوثيقة', 'اسم العميل', 'رقم السيارة', 'الشركة المصنعة', 'تصنيف السيارة',
      'نوع التأمين', 'قيمة السيارة', 'تاريخ البداية', 'تاريخ النهاية',
      'سعر التأمين', 'المستحق للشركة', 'الربح', 'أنشئ بواسطة', 'تاريخ الإنشاء',
    ];
    
    const rows = filteredPolicies.map(policy => [
      policy.id.substring(0, 8),
      policy.client?.full_name || '-',
      policy.car?.car_number || '-',
      policy.car?.manufacturer_name || '-',
      getCarTypeLabel(policy.car?.car_type || null),
      getInsuranceTypeLabelLocal(policy),
      isFullPolicy(policy) ? (policy.car?.car_value || 0) : '',
      formatDate(policy.start_date),
      formatDate(policy.end_date),
      policy.insurance_price,
      policy.payed_for_company || 0,
      policy.profit || 0,
      policy.creator?.full_name || policy.creator?.email || '-',
      formatDate(policy.created_at),
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `company-settlement-detail-${company?.name_ar || company?.name}-${showAllTime ? 'all-time' : `${startDate}-${endDate}`}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateReport = async () => {
    if (!companyId) return;
    
    setGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-settlement-report', {
        body: {
          company_id: companyId,
          start_date: showAllTime ? null : startDate,
          end_date: showAllTime ? null : endDate,
          policy_type: selectedPolicyType !== 'all' ? selectedPolicyType : null,
          include_cancelled: includeCancelled,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
        uiToast({
          title: 'تم إنشاء التقرير',
          description: `تقرير ${company?.name_ar || company?.name} جاهز للطباعة`,
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      uiToast({
        title: 'خطأ',
        description: 'فشل في إنشاء التقرير',
        variant: 'destructive',
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleGenerateTaxInvoice = async () => {
    if (!companyId) return;
    setGeneratingTaxInvoice(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-tax-invoice', {
        body: {
          company_id: companyId,
          start_date: showAllTime ? null : startDate,
          end_date: showAllTime ? null : endDate,
          policy_type: selectedPolicyType !== 'all' ? selectedPolicyType : null,
          include_cancelled: includeCancelled,
          profit_percent: profitPercent,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
        uiToast({ title: 'تم إنشاء الفاتورة الضريبية', description: 'الفاتورة جاهزة للطباعة' });
      }
      setShowTaxInvoiceInput(false);
    } catch (error) {
      console.error('Error generating tax invoice:', error);
      uiToast({ title: 'خطأ', description: 'فشل في إنشاء الفاتورة الضريبية', variant: 'destructive' });
    } finally {
      setGeneratingTaxInvoice(false);
    }
  };

  const handleExplainCalculation = (policy: PolicyDetail) => {
    setSelectedPolicyForCalc(policy);
    setCalculationModalOpen(true);
  };

  const handleViewPolicy = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setDetailsDrawerOpen(true);
  };

  const handlePolicyUpdated = () => {
    fetchCompanyAndPolicies();
  };

  const getFilterDescription = () => {
    const parts: string[] = [];
    if (showAllTime) {
      parts.push('كل الفترات');
    } else {
      parts.push(`من ${formatDate(startDate)} إلى ${formatDate(endDate)}`);
    }
    if (!includeCancelled) {
      parts.push('بدون الملغية');
    }
    return parts.join(' • ');
  };

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
        title={`تفاصيل تسوية ${company?.name_ar || company?.name || 'الشركة'}`}
        subtitle="عرض جميع الوثائق وتفاصيل الحسابات"
        action={{
          label: 'العودة للتقرير',
          onClick: () => navigate('/reports/company-settlement'),
        }}
      />

      <div className="p-6 space-y-6 print:p-0">
        {/* Back button and Wallet access */}
        <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
          <Button
            variant="ghost"
            onClick={() => navigate('/reports/company-settlement')}
          >
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة للتقرير الرئيسي
          </Button>
          
          <Button
            variant="default"
            onClick={() => navigate(`/reports/company-settlement/${companyId}/wallet`)}
            className="gap-2"
          >
            <CreditCard className="h-4 w-4" />
            محفظة الشركة / دفعة جديدة
          </Button>
        </div>


        {/* Filters */}
        <Card className="print:hidden">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <ArabicDatePicker
                  value={startDate}
                  onChange={(date) => {
                    setStartDate(date);
                    setShowAllTime(false);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <ArabicDatePicker
                  value={endDate}
                  onChange={(date) => {
                    setEndDate(date);
                    setShowAllTime(false);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>نوع التأمين</Label>
                <Select value={selectedPolicyType} onValueChange={setSelectedPolicyType}>
                  <SelectTrigger>
                    <SelectValue placeholder="جميع الأنواع" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all">جميع الأنواع</SelectItem>
                    {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>الملغية</Label>
                <Select 
                  value={includeCancelled ? 'include' : 'exclude'} 
                  onValueChange={(v) => setIncludeCancelled(v === 'include')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="exclude">استبعاد الملغية</SelectItem>
                    <SelectItem value="include">تضمين الملغية</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button 
                  variant="default" 
                  onClick={handleGenerateReport}
                  disabled={generatingReport}
                  className="flex-1"
                >
                  {generatingReport ? (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 ml-2" />
                  )}
                  تقرير PDF
                </Button>
                <Button variant="outline" onClick={exportToCSV}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowTaxInvoiceInput(!showTaxInvoiceInput)}
                  className="flex-1"
                >
                  <Receipt className="h-4 w-4 ml-2" />
                  فاتورة ضريبية
                </Button>
                <Button variant="ghost" onClick={handleResetFilters}>
                  <RotateCcw className="h-4 w-4 ml-2" />
                  كل الفترات
                </Button>
              </div>
            </div>

            {/* Tax Invoice Percent Input */}
            {showTaxInvoiceInput && (
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                <Label className="whitespace-nowrap">نسبة المربح:</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={profitPercent}
                  onChange={(e) => setProfitPercent(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <Button 
                  onClick={handleGenerateTaxInvoice}
                  disabled={generatingTaxInvoice}
                >
                  {generatingTaxInvoice ? (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  ) : (
                    <Receipt className="h-4 w-4 ml-2" />
                  )}
                  إنشاء الفاتورة
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Print Header */}
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-bold">تفاصيل تسوية {company?.name_ar || company?.name}</h1>
          <p className="text-muted-foreground">{getFilterDescription()}</p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">عدد الوثائق</p>
                  <p className="text-2xl font-bold">{summary.totalPolicies.toLocaleString('en-US')}</p>
                </div>
                <div className="rounded-xl bg-primary/10 p-3 print:hidden">
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
                  <p className="text-2xl font-bold">₪{summary.totalInsurancePrice.toLocaleString('en-US')}</p>
                </div>
                <div className="rounded-xl bg-primary/10 p-3 print:hidden">
                  <Wallet className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">المستحق للشركة</p>
                  <p className="text-2xl font-bold text-destructive">₪{summary.totalCompanyPayment.toLocaleString('en-US')}</p>
                </div>
                <div className="rounded-xl bg-destructive/10 p-3 print:hidden">
                  <Building2 className="h-6 w-6 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">إجمالي الربح</p>
                  <p className="text-2xl font-bold text-success">₪{summary.totalProfit.toLocaleString('en-US')}</p>
                </div>
                <div className="rounded-xl bg-success/10 p-3 print:hidden">
                  <TrendingUp className="h-6 w-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Policies Table */}
        <Card>
          <CardHeader className="print:pb-2">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>الوثائق ({filteredPolicies.length})</CardTitle>
              <div className="flex items-center gap-2 flex-1 max-w-md print:hidden">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث: اسم، رقم سيارة، مبلغ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortAsc(!sortAsc)}
                  className="gap-2"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  {sortAsc ? 'من الأقدم للأحدث' : 'من الأحدث للأقدم'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">السيارة</TableHead>
                    <TableHead className="text-right">الشركة المصنعة</TableHead>
                    <TableHead className="text-right">تصنيف السيارة</TableHead>
                    <TableHead className="text-right">نوع التأمين</TableHead>
                    <TableHead className="text-right">قيمة السيارة</TableHead>
                    <TableHead className="text-right">تاريخ البداية</TableHead>
                    <TableHead className="text-right">سعر التأمين</TableHead>
                    <TableHead className="text-right">المستحق للشركة</TableHead>
                    <TableHead className="text-right">الربح</TableHead>
                    <TableHead className="text-right print:hidden">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 11 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredPolicies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        لا توجد وثائق للفترة المحددة
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPolicies.map((policy) => {
                      const isEditing = editingPolicyId === policy.id;
                      return (
                        <TableRow 
                          key={policy.id}
                          className={cn(
                            "transition-colors",
                            policy.cancelled && "opacity-50 bg-muted/30",
                            policy.transferred && "opacity-50 bg-amber-500/5"
                          )}
                        >
                          <TableCell className="font-medium">
                            <span 
                              className="text-primary cursor-pointer hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (policy.client?.id) navigate(`/clients?clientId=${policy.client.id}`);
                              }}
                            >
                              {policy.client?.full_name || '-'}
                            </span>
                            {policy.cancelled && (
                              <Badge variant="destructive" className="mr-2 text-xs">ملغية</Badge>
                            )}
                            {policy.transferred && (
                              <Badge variant="warning" className="mr-2 text-xs gap-1">
                                محولة ← {policy.transferred_to_car_number || ''}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono">
                            <bdi>{policy.car?.car_number || '-'}</bdi>
                          </TableCell>
                          <TableCell>
                            {policy.car?.manufacturer_name || '-'}
                          </TableCell>
                          <TableCell>
                            {getCarTypeLabel(policy.car?.car_type || null)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getInsuranceTypeBadgeClass(policy.policy_type_parent)}>
                              {getInsuranceTypeLabelLocal(policy)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={editValues.car_value}
                                onChange={(e) => setEditValues(v => ({ ...v, car_value: Number(e.target.value) }))}
                                className="w-24 h-8 text-sm"
                              />
                            ) : (
                              policy.car?.car_value ? `₪${policy.car.car_value.toLocaleString('en-US')}` : '-'
                            )}
                          </TableCell>
                          <TableCell>{formatDate(policy.start_date)}</TableCell>
                          
                          {/* Insurance Price */}
                          <TableCell className="font-mono">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={editValues.insurance_price}
                                onChange={(e) => setEditValues(v => ({ ...v, insurance_price: Number(e.target.value) }))}
                                className="w-24 h-8 text-sm"
                              />
                            ) : (
                              `₪${Number(policy.insurance_price).toLocaleString('en-US')}`
                            )}
                          </TableCell>
                          
                          {/* Company Payment */}
                          <TableCell className={cn("font-mono", !isEditing && (policy.transferred ? "text-muted-foreground" : "text-destructive"))}>
                            {isEditing ? (
                              <Input
                                type="number"
                                value={editValues.payed_for_company}
                                onChange={(e) => setEditValues(v => ({ ...v, payed_for_company: Number(e.target.value) }))}
                                className="w-24 h-8 text-sm"
                              />
                            ) : policy.transferred ? (
                              <span className="line-through">₪0</span>
                            ) : (
                              `₪${Number(policy.payed_for_company || 0).toLocaleString('en-US')}`
                            )}
                          </TableCell>
                          
                          {/* Profit */}
                          <TableCell className={cn("font-mono", !isEditing && (policy.transferred ? "text-muted-foreground" : "text-success"))}>
                            {isEditing ? (
                              <Input
                                type="number"
                                value={editValues.profit}
                                onChange={(e) => setEditValues(v => ({ ...v, profit: Number(e.target.value) }))}
                                className="w-24 h-8 text-sm"
                              />
                            ) : policy.transferred ? (
                              <span className="line-through">₪0</span>
                            ) : (
                              `₪${Number(policy.profit || 0).toLocaleString('en-US')}`
                            )}
                          </TableCell>
                          
                          {/* Actions */}
                          <TableCell className="print:hidden">
                            <div className="flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSaveEdit}
                                    disabled={savingEdit}
                                    title="حفظ"
                                    className="text-success"
                                  >
                                    {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelEdit}
                                    title="إلغاء"
                                    className="text-destructive"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewPolicy(policy.id)}
                                    title="عرض التفاصيل"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStartEdit(policy)}
                                    title="تعديل المبالغ"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleExplainCalculation(policy)}
                                    title="شرح الحسبة"
                                  >
                                    <Calculator className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Company Cheques Section */}
        <Card className="print:hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                شيكات محولة لهذه الشركة ({companyCheques.length})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/reports/company-settlement/${companyId}/wallet`)}
                className="gap-2"
              >
                <Wallet className="h-4 w-4" />
                عرض محفظة الشركة
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingCheques ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : companyCheques.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">لا توجد شيكات محولة لهذه الشركة</p>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الشيك</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">تاريخ الاستحقاق</TableHead>
                      <TableHead className="text-right">العميل</TableHead>
                      <TableHead className="text-right">السيارة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companyCheques.map((cheque) => (
                      <TableRow key={cheque.id}>
                        <TableCell className="font-mono">{cheque.cheque_number || '-'}</TableCell>
                        <TableCell className="font-mono">₪{cheque.amount.toLocaleString('en-US')}</TableCell>
                        <TableCell>{formatDate(cheque.payment_date)}</TableCell>
                        <TableCell>{cheque.client_name || '-'}</TableCell>
                        <TableCell className="font-mono"><bdi>{cheque.car_number || '-'}</bdi></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calculation Explanation Modal */}
      <CalculationExplanationModal
        open={calculationModalOpen}
        onOpenChange={setCalculationModalOpen}
        policy={selectedPolicyForCalc}
        company={company}
      />

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
    </MainLayout>
  );
}
