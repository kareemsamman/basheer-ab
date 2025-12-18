import { useState, useEffect } from 'react';
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
import { Building2, Download, TrendingUp, Wallet, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Company = Tables<'insurance_companies'>;

interface CompanySettlementData {
  company_id: string;
  company_name: string;
  company_name_ar: string | null;
  policy_type: Enums<'policy_type_parent'>;
  policy_count: number;
  total_insurance_price: number;
  total_company_payment: number;
  total_profit: number;
}

const POLICY_TYPE_LABELS: Record<Enums<'policy_type_parent'>, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'طرف ثالث / شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
  HEALTH: 'التأمين الصحي',
  LIFE: 'تأمين الحياة',
  PROPERTY: 'تأمين الممتلكات',
  TRAVEL: 'تأمين السفر',
  BUSINESS: 'تأمين الشركات',
  OTHER: 'أخرى',
};

export default function CompanySettlement() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompanySettlementData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [includeCancelled, setIncludeCancelled] = useState(false);

  // Summary totals
  const [summary, setSummary] = useState({
    totalPolicies: 0,
    totalInsurancePrice: 0,
    totalCompanyPayment: 0,
    totalProfit: 0,
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    fetchSettlementData();
  }, [selectedMonth, selectedCompany, selectedCategory, includeCancelled]);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('insurance_companies')
        .select('*')
        .eq('active', true)
        .order('name_ar');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchSettlementData = async () => {
    setLoading(true);
    try {
      // Parse month for date range
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      // Build query
      let query = supabase
        .from('policies')
        .select(`
          id,
          policy_type_parent,
          insurance_price,
          payed_for_company,
          profit,
          company_id,
          cancelled,
          insurance_companies!inner (
            id,
            name,
            name_ar
          )
        `)
        .is('deleted_at', null)
        .gte('start_date', startDate)
        .lte('start_date', endDate);

      if (!includeCancelled) {
        query = query.eq('cancelled', false);
      }

      if (selectedCompany !== 'all') {
        query = query.eq('company_id', selectedCompany);
      }

      if (selectedCategory !== 'all') {
        query = query.eq('policy_type_parent', selectedCategory as Enums<'policy_type_parent'>);
      }

      const { data: policies, error } = await query;

      if (error) throw error;

      // Aggregate data by company and policy type
      const aggregated = new Map<string, CompanySettlementData>();

      policies?.forEach((policy: any) => {
        const key = `${policy.company_id}-${policy.policy_type_parent}`;
        const existing = aggregated.get(key);

        if (existing) {
          existing.policy_count += 1;
          existing.total_insurance_price += Number(policy.insurance_price) || 0;
          existing.total_company_payment += Number(policy.payed_for_company) || 0;
          existing.total_profit += Number(policy.profit) || 0;
        } else {
          aggregated.set(key, {
            company_id: policy.company_id,
            company_name: policy.insurance_companies.name,
            company_name_ar: policy.insurance_companies.name_ar,
            policy_type: policy.policy_type_parent,
            policy_count: 1,
            total_insurance_price: Number(policy.insurance_price) || 0,
            total_company_payment: Number(policy.payed_for_company) || 0,
            total_profit: Number(policy.profit) || 0,
          });
        }
      });

      const result = Array.from(aggregated.values()).sort((a, b) => 
        (a.company_name_ar || a.company_name).localeCompare(b.company_name_ar || b.company_name)
      );

      setData(result);

      // Calculate summary
      const totals = result.reduce(
        (acc, item) => ({
          totalPolicies: acc.totalPolicies + item.policy_count,
          totalInsurancePrice: acc.totalInsurancePrice + item.total_insurance_price,
          totalCompanyPayment: acc.totalCompanyPayment + item.total_company_payment,
          totalProfit: acc.totalProfit + item.total_profit,
        }),
        { totalPolicies: 0, totalInsurancePrice: 0, totalCompanyPayment: 0, totalProfit: 0 }
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

  const exportToCSV = () => {
    const headers = ['الشركة', 'نوع الوثيقة', 'عدد الوثائق', 'إجمالي المحصل', 'المستحق للشركة', 'الربح'];
    const rows = data.map(item => [
      item.company_name_ar || item.company_name,
      POLICY_TYPE_LABELS[item.policy_type],
      item.policy_count,
      item.total_insurance_price,
      item.total_company_payment,
      item.total_profit,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `company-settlement-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
        title="تقرير تسوية الشركات"
        subtitle="ملخص المبالغ المستحقة للشركات والأرباح"
      />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>الشهر</Label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label>الشركة</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger>
                    <SelectValue placeholder="جميع الشركات" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all">جميع الشركات</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name_ar || company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>نوع الوثيقة</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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
                  <p className="text-sm font-medium text-muted-foreground">المستحق للشركات</p>
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

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>تفاصيل التسوية حسب الشركة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الشركة</TableHead>
                    <TableHead className="text-right">نوع الوثيقة</TableHead>
                    <TableHead className="text-right">عدد الوثائق</TableHead>
                    <TableHead className="text-right">إجمالي المحصل</TableHead>
                    <TableHead className="text-right">المستحق للشركة</TableHead>
                    <TableHead className="text-right">الربح</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد بيانات للفترة المحددة
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {item.company_name_ar || item.company_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {POLICY_TYPE_LABELS[item.policy_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.policy_count.toLocaleString('ar-EG')}</TableCell>
                        <TableCell className="font-mono">
                          ₪{item.total_insurance_price.toLocaleString('ar-EG')}
                        </TableCell>
                        <TableCell className="font-mono text-destructive">
                          ₪{item.total_company_payment.toLocaleString('ar-EG')}
                        </TableCell>
                        <TableCell className="font-mono text-success">
                          ₪{item.total_profit.toLocaleString('ar-EG')}
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
    </MainLayout>
  );
}
