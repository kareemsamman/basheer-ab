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
import { ArrowRight, Building2, Download, TrendingUp, Wallet, FileText, Calculator, Printer, Eye, Pencil, RotateCcw, Loader2, CreditCard, Plus } from 'lucide-react';
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

export default function CompanySettlementDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [policies, setPolicies] = useState<PolicyDetail[]>([]);
  
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

  // Filtered data - include transferred policies but show them with 0 values
  const filteredPolicies = useMemo(() => {
    return policies.filter(policy => {
      if (selectedPolicyType !== 'all' && policy.policy_type_parent !== selectedPolicyType) {
        return false;
      }
      if (!includeCancelled && policy.cancelled) {
        return false;
      }
      // Note: Transferred policies are included but their values show as 0
      return true;
    });
  }, [policies, selectedPolicyType, includeCancelled]);

  // Summary totals - exclude transferred policies from calculations (they have 0 debt/profit)
  const summary = useMemo(() => {
    return filteredPolicies.reduce(
      (acc, policy) => {
        // Skip transferred policies in calculations (their debt/profit moved to new policy)
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
    // Scroll to top when page loads
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (companyId) {
      fetchCompanyAndPolicies();
    }
  }, [companyId, startDate, endDate, showAllTime]);

  const fetchCompanyAndPolicies = async () => {
    if (!companyId) return;
    
    setLoading(true);
    try {
      // Fetch company info
      const { data: companyData, error: companyError } = await supabase
        .from('insurance_companies')
        .select('id, name, name_ar')
        .eq('id', companyId)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

      // Build query
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
            year
          ),
          profiles:created_by_admin_id (
            id,
            full_name,
            email
          )
        `)
        .eq('company_id', companyId)
        .is('deleted_at', null);

      // Apply date filter only if not showing all time
      if (!showAllTime) {
        query = query
          .gte('start_date', startDate)
          .lte('start_date', endDate);
      }

      const { data: policiesData, error: policiesError } = await query.order('created_at', { ascending: false });

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
      toast({
        title: 'خطأ',
        description: 'فشل في جلب البيانات',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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
      car: 'سيارة',
      cargo: 'شحن',
      small: 'صغيرة',
      taxi: 'تاكسي',
      tjeradown4: 'تجاري < 4 طن',
      tjeraup4: 'تجاري > 4 طن',
    };
    return carType ? labels[carType] || carType : '-';
  };

  const handleResetFilters = () => {
    setShowAllTime(true);
    setSelectedPolicyType('all');
    setIncludeCancelled(false);
  };

  const exportToCSV = () => {
    const headers = [
      'رقم الوثيقة',
      'اسم العميل',
      'رقم السيارة',
      'نوع السيارة',
      'نوع التأمين',
      'تاريخ البداية',
      'تاريخ النهاية',
      'سعر التأمين',
      'المستحق للشركة',
      'الربح',
      'أنشئ بواسطة',
      'تاريخ الإنشاء',
    ];
    
    const rows = filteredPolicies.map(policy => [
      policy.id.substring(0, 8),
      policy.client?.full_name || '-',
      policy.car?.car_number || '-',
      getCarTypeLabel(policy.car?.car_type || null),
      getInsuranceTypeLabelLocal(policy),
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
        toast({
          title: 'تم إنشاء التقرير',
          description: `تقرير ${company?.name_ar || company?.name} جاهز للطباعة`,
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'خطأ',
        description: 'فشل في إنشاء التقرير',
        variant: 'destructive',
      });
    } finally {
      setGeneratingReport(false);
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

  const handleEditPolicy = (policyId: string) => {
    // Open details drawer which has edit functionality
    setSelectedPolicyId(policyId);
    setDetailsDrawerOpen(true);
  };

  const handlePolicyUpdated = () => {
    fetchCompanyAndPolicies();
  };

  // Format the current filter description
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
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-end">
                <Button variant="ghost" onClick={handleResetFilters} className="w-full">
                  <RotateCcw className="h-4 w-4 ml-2" />
                  كل الفترات
                </Button>
              </div>
            </div>
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
                  <p className="text-2xl font-bold">{summary.totalPolicies.toLocaleString('ar-EG')}</p>
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
                  <p className="text-2xl font-bold">₪{summary.totalInsurancePrice.toLocaleString('ar-EG')}</p>
                </div>
                <div className="rounded-xl bg-blue-500/10 p-3 print:hidden">
                  <Wallet className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">المستحق للشركة</p>
                  <p className="text-2xl font-bold text-destructive">₪{summary.totalCompanyPayment.toLocaleString('ar-EG')}</p>
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
                  <p className="text-2xl font-bold text-success">₪{summary.totalProfit.toLocaleString('ar-EG')}</p>
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
            <CardTitle>الوثائق ({filteredPolicies.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">السيارة</TableHead>
                    <TableHead className="text-right">نوع التأمين</TableHead>
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
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredPolicies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        لا توجد وثائق للفترة المحددة
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPolicies.map((policy) => (
                      <TableRow 
                        key={policy.id}
                        className={cn(
                          "transition-colors",
                          policy.cancelled && "opacity-50 bg-muted/30",
                          policy.transferred && "opacity-50 bg-amber-500/5"
                        )}
                      >
                        <TableCell className="font-medium">
                          {policy.client?.full_name || '-'}
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
                          <Badge variant="outline" className={getInsuranceTypeBadgeClass(policy.policy_type_parent)}>
                            {getInsuranceTypeLabelLocal(policy)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(policy.start_date)}</TableCell>
                        <TableCell className="font-mono">
                          ₪{Number(policy.insurance_price).toLocaleString('ar-EG')}
                        </TableCell>
                        <TableCell className={cn("font-mono", policy.transferred ? "text-muted-foreground" : "text-destructive")}>
                          {policy.transferred ? (
                            <span className="line-through">₪0</span>
                          ) : (
                            <>₪{Number(policy.payed_for_company || 0).toLocaleString('ar-EG')}</>
                          )}
                        </TableCell>
                        <TableCell className={cn("font-mono", policy.transferred ? "text-muted-foreground" : "text-success")}>
                          {policy.transferred ? (
                            <span className="line-through">₪0</span>
                          ) : (
                            <>₪{Number(policy.profit || 0).toLocaleString('ar-EG')}</>
                          )}
                        </TableCell>
                        <TableCell className="print:hidden">
                          <div className="flex items-center gap-1">
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
                              onClick={() => handleEditPolicy(policy.id)}
                              title="تعديل"
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
