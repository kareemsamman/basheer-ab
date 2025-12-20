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
import { ArrowRight, Building2, Download, TrendingUp, Wallet, FileText, Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { CalculationExplanationModal } from '@/components/reports/CalculationExplanationModal';
import { 
  POLICY_TYPE_LABELS, 
  POLICY_CHILD_LABELS, 
  getInsuranceTypeBadgeClass,
  getInsuranceTypeLabel 
} from '@/lib/insuranceTypes';
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
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyDetail | null>(null);
  const [calculationModalOpen, setCalculationModalOpen] = useState(false);
  
  // Filters
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

  // Filtered data
  const filteredPolicies = useMemo(() => {
    return policies.filter(policy => {
      if (selectedPolicyType !== 'all' && policy.policy_type_parent !== selectedPolicyType) {
        return false;
      }
      return true;
    });
  }, [policies, selectedPolicyType]);

  // Summary totals
  const summary = useMemo(() => {
    return filteredPolicies.reduce(
      (acc, policy) => ({
        totalPolicies: acc.totalPolicies + 1,
        totalInsurancePrice: acc.totalInsurancePrice + (Number(policy.insurance_price) || 0),
        totalCompanyPayment: acc.totalCompanyPayment + (Number(policy.payed_for_company) || 0),
        totalProfit: acc.totalProfit + (Number(policy.profit) || 0),
      }),
      { totalPolicies: 0, totalInsurancePrice: 0, totalCompanyPayment: 0, totalProfit: 0 }
    );
  }, [filteredPolicies]);

  useEffect(() => {
    if (companyId) {
      fetchCompanyAndPolicies();
    }
  }, [companyId, startDate, endDate]);

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

      // Fetch policies with relations
      const { data: policiesData, error: policiesError } = await supabase
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
        .is('deleted_at', null)
        .eq('cancelled', false)
        .gte('start_date', startDate)
        .lte('start_date', endDate)
        .order('created_at', { ascending: false });

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
    return new Date(dateStr).toLocaleDateString('ar-EG');
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
    link.download = `company-settlement-detail-${company?.name_ar || company?.name}-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExplainCalculation = (policy: PolicyDetail) => {
    setSelectedPolicy(policy);
    setCalculationModalOpen(true);
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

      <div className="p-6 space-y-6">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/reports/company-settlement')}
          className="mb-2"
        >
          <ArrowRight className="h-4 w-4 ml-2" />
          العودة للتقرير الرئيسي
        </Button>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  dir="ltr"
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

              <div className="flex items-end">
                <Button variant="outline" onClick={exportToCSV} className="w-full">
                  <Download className="h-4 w-4 ml-2" />
                  تصدير CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">عدد الوثائق</p>
                  <p className="text-2xl font-bold">{summary.totalPolicies.toLocaleString('ar-EG')}</p>
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
                  <p className="text-2xl font-bold">₪{summary.totalInsurancePrice.toLocaleString('ar-EG')}</p>
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
                  <p className="text-sm font-medium text-muted-foreground">المستحق للشركة</p>
                  <p className="text-2xl font-bold text-destructive">₪{summary.totalCompanyPayment.toLocaleString('ar-EG')}</p>
                </div>
                <div className="rounded-xl bg-destructive/10 p-3">
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
                <div className="rounded-xl bg-success/10 p-3">
                  <TrendingUp className="h-6 w-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Policies Table */}
        <Card>
          <CardHeader>
            <CardTitle>الوثائق</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الوثيقة</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">السيارة</TableHead>
                    <TableHead className="text-right">نوع السيارة</TableHead>
                    <TableHead className="text-right">نوع التأمين</TableHead>
                    <TableHead className="text-right">تاريخ البداية</TableHead>
                    <TableHead className="text-right">تاريخ النهاية</TableHead>
                    <TableHead className="text-right">سعر التأمين</TableHead>
                    <TableHead className="text-right">المستحق للشركة</TableHead>
                    <TableHead className="text-right">الربح</TableHead>
                    <TableHead className="text-right">أنشئ بواسطة</TableHead>
                    <TableHead className="text-right">شرح الحسبة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 13 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredPolicies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        لا توجد وثائق للفترة المحددة
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPolicies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-mono text-xs">
                          {policy.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell className="font-medium">
                          {policy.client?.full_name || '-'}
                        </TableCell>
                        <TableCell className="font-mono" dir="ltr">
                          {policy.car?.car_number || '-'}
                        </TableCell>
                        <TableCell>
                          {getCarTypeLabel(policy.car?.car_type || null)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getInsuranceTypeBadgeClass(policy.policy_type_parent)}>
                            {getInsuranceTypeLabelLocal(policy)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(policy.start_date)}</TableCell>
                        <TableCell>{formatDate(policy.end_date)}</TableCell>
                        <TableCell className="font-mono">
                          ₪{Number(policy.insurance_price).toLocaleString('ar-EG')}
                        </TableCell>
                        <TableCell className="font-mono text-destructive">
                          ₪{Number(policy.payed_for_company || 0).toLocaleString('ar-EG')}
                        </TableCell>
                        <TableCell className="font-mono text-success">
                          ₪{Number(policy.profit || 0).toLocaleString('ar-EG')}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {policy.creator?.full_name || policy.creator?.email || '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExplainCalculation(policy)}
                          >
                            <Calculator className="h-4 w-4 ml-1" />
                            شرح
                          </Button>
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
        policy={selectedPolicy}
        company={company}
      />
    </MainLayout>
  );
}
