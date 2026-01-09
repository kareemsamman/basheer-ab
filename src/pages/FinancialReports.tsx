import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  TrendingUp, 
  Building2, 
  Users, 
  Wallet,
  RefreshCw,
  CheckCircle,
  Banknote,
  Receipt,
  FileText,
  PiggyBank,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useProfitSummary } from "@/hooks/useProfitSummary";
import { Link } from "react-router-dom";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface CompanyBalance {
  companyId: string;
  companyName: string;
  companyNameAr: string;
  totalPayable: number;
  totalPaid: number;
  outstanding: number;
}

interface LedgerEntry {
  id: string;
  transactionDate: string;
  referenceType: string;
  counterpartyType: string;
  amount: number;
  category: string;
  status: string;
  description: string;
  policyType: string;
}

interface ABWallet {
  totalCashIn: number; // كل المبالغ الداخلة (insurance_price)
  totalCompanyPayments: number; // المدفوع للشركات
  totalBrokerPayments: number; // المدفوع للوسطاء
  totalExpenses: number; // المصاريف
  netCash: number; // الصافي في الخزينة
  totalProfit: number; // إجمالي الربح
  companyDebt: number; // مستحق للشركات
  brokerDebt: number; // مستحق للوسطاء
  monthExpenses: number; // مصاريف الشهر
}

const referenceTypeLabels: Record<string, string> = {
  policy_created: 'بوليصة جديدة',
  policy_cancelled: 'إلغاء بوليصة',
  payment_received: 'دفعة مستلمة',
  payment_refused: 'دفعة مرفوضة',
  cheque_returned: 'شيك راجع',
  broker_settlement: 'تسوية وسيط',
  customer_refund: 'مرتجع عميل',
  company_settlement: 'تسوية شركة',
};

const categoryLabels: Record<string, string> = {
  premium_income: 'إيراد تأمين',
  company_payable: 'مستحق لشركة',
  commission_expense: 'تكلفة عمولة',
  profit_share: 'حصة ربح',
  broker_payable: 'مستحق لوسيط',
  broker_receivable: 'مستحق من وسيط',
  receivable_collected: 'تحصيل',
  receivable_reversal: 'عكس تحصيل',
  refund_payable: 'مرتجع للعميل',
  broker_settlement_paid: 'تسوية (دفعنا)',
  broker_settlement_received: 'تسوية (استلمنا)',
  company_settlement_paid: 'سداد لشركة',
};

const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'posted': return 'default';
    case 'reversed': return 'destructive';
    case 'pending': return 'secondary';
    default: return 'outline';
  }
};

export default function FinancialReports() {
  const { summary: profitSummary, loading: profitLoading, refetch: refetchProfit } = useProfitSummary();
  const [abWallet, setAbWallet] = useState<ABWallet | null>(null);
  const [companyBalances, setCompanyBalances] = useState<CompanyBalance[]>([]);
  const [recentEntries, setRecentEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      
      // 1. Get total ACTUAL cash in (only payments from active policies, not cancelled/deleted)
      const { data: customerPayments } = await supabase
        .from('policy_payments')
        .select('amount, refused, policy_id, policies!inner(cancelled, deleted_at)')
        .neq('refused', true);
      
      let totalCashIn = 0;
      (customerPayments || []).forEach(p => {
        const policy = p.policies as any;
        // Exclude payments from cancelled or deleted policies
        if (!policy?.cancelled && !policy?.deleted_at) {
          totalCashIn += Number(p.amount) || 0;
        }
      });
      
      // 1b. Subtract customer refunds from cash in (money given back to customers)
      const { data: customerRefunds } = await supabase
        .from('customer_wallet_transactions')
        .select('amount, transaction_type')
        .eq('transaction_type', 'refund');
      
      let totalRefunds = 0;
      (customerRefunds || []).forEach(r => {
        totalRefunds += Number(r.amount) || 0;
      });
      
      // 2. Get company debt from policies (direct companies only, including cancelled with negative)
      const { data: policiesData } = await supabase
        .from('policies')
        .select('payed_for_company, profit, company_id, cancelled, insurance_companies!policies_company_id_fkey(broker_id)')
        .is('deleted_at', null);
      
      let companyDebt = 0;
      let totalProfit = 0;
      
      (policiesData || []).forEach(p => {
        const isCancelled = p.cancelled;
        const multiplier = isCancelled ? -1 : 1; // Negative for cancelled
        
        totalProfit += (Number(p.profit) || 0) * multiplier;
        
        // Only add to company debt if company is not broker-linked
        const companyData = p.insurance_companies as any;
        if (!companyData?.broker_id) {
          companyDebt += (Number(p.payed_for_company) || 0) * multiplier;
        }
      });
      
      // 2. Get company settlements (paid to companies)
      const { data: companySettlements } = await supabase
        .from('company_settlements')
        .select('total_amount, refused')
        .eq('status', 'completed')
        .neq('refused', true);
      
      const totalCompanyPayments = (companySettlements || []).reduce((sum, s) => sum + Number(s.total_amount), 0);
      
      // 3. Get broker settlements (paid to/from brokers)
      const { data: brokerSettlements } = await supabase
        .from('broker_settlements')
        .select('total_amount, direction, status')
        .eq('status', 'completed');
      
      let totalBrokerPayments = 0;
      let brokerPaymentsReceived = 0; // Money received from brokers
      (brokerSettlements || []).forEach(s => {
        if (s.direction === 'to_broker') {
          totalBrokerPayments += Number(s.total_amount);
        } else if (s.direction === 'from_broker') {
          brokerPaymentsReceived += Number(s.total_amount);
        }
      });
      
      // 4. Get broker debt (from policies with broker_direction = 'from_broker')
      // This is what we owe brokers for policies they created for us
      const { data: brokerPoliciesFromBroker } = await supabase
        .from('policies')
        .select('broker_buy_price, insurance_price, broker_direction')
        .is('deleted_at', null)
        .eq('cancelled', false)
        .eq('broker_direction', 'from_broker');
      
      let brokerDebt = 0;
      (brokerPoliciesFromBroker || []).forEach(p => {
        brokerDebt += Number(p.broker_buy_price) || Number(p.insurance_price) || 0;
      });
      brokerDebt -= totalBrokerPayments; // Subtract what we already paid to brokers
      
      // 5. Get expenses
      const { data: allExpenses } = await supabase
        .from('expenses')
        .select('amount');
      
      const { data: monthExpensesData } = await supabase
        .from('expenses')
        .select('amount')
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd);
      
      const totalExpenses = (allExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const monthExpenses = (monthExpensesData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      
      // Calculate net cash
      // صافي الخزينة = كل الداخل - المرتجعات - المدفوع للشركات - المدفوع للوسطاء - المصاريف
      const netCash = totalCashIn - totalRefunds - totalCompanyPayments - totalBrokerPayments - totalExpenses;
      
      // Update company debt to reflect what's remaining
      companyDebt = companyDebt - totalCompanyPayments;
      
      setAbWallet({
        totalCashIn,
        totalCompanyPayments,
        totalBrokerPayments,
        totalExpenses,
        netCash,
        totalProfit,
        companyDebt: Math.max(0, companyDebt),
        brokerDebt: Math.max(0, brokerDebt),
        monthExpenses,
      });

      // Fetch company balances - exclude broker-linked companies
      const { data: companies, error: companiesError } = await supabase
        .from('insurance_companies')
        .select('id, name, name_ar, broker_id')
        .eq('active', true)
        .is('broker_id', null);
      
      if (companiesError) throw companiesError;
      
      const balances: CompanyBalance[] = [];
      for (const company of companies || []) {
        const { data: balanceData } = await supabase
          .rpc('get_company_balance', { p_company_id: company.id });
        
        if (balanceData && balanceData.length > 0) {
          const b = balanceData[0];
          if (Number(b.total_payable) > 0 || Number(b.outstanding) > 0) {
            balances.push({
              companyId: company.id,
              companyName: company.name,
              companyNameAr: company.name_ar || company.name,
              totalPayable: Number(b.total_payable) || 0,
              totalPaid: Number(b.total_paid) || 0,
              outstanding: Number(b.outstanding) || 0,
            });
          }
        }
      }
      setCompanyBalances(balances.sort((a, b) => b.outstanding - a.outstanding));

      // Fetch recent ledger entries
      const { data: entriesData, error: entriesError } = await supabase
        .from('ab_ledger')
        .select('*')
        .eq('status', 'posted')
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (entriesError) throw entriesError;
      
      setRecentEntries((entriesData || []).map(e => ({
        id: e.id,
        transactionDate: e.transaction_date,
        referenceType: e.reference_type,
        counterpartyType: e.counterparty_type,
        amount: Number(e.amount),
        category: e.category,
        status: e.status,
        description: e.description || '',
        policyType: e.policy_type || '',
      })));

    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast.error('حدث خطأ في جلب البيانات المالية');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([fetchData(), refetchProfit()]);
      toast.success('تم تحديث البيانات');
    } finally {
      setSyncing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₪${Math.abs(amount).toLocaleString('ar-EG', { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG');
  };

  return (
    <MainLayout>
      <Header 
        title="التقارير المالية" 
        subtitle="محفظة AB الموحدة"
        action={{
          label: syncing ? "جاري التحديث..." : "تحديث",
          onClick: handleSync,
        }}
      />

      <div className="p-6 space-y-6">
        {/* Main AB Wallet Card - Full Width */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="py-6">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">المبلغ الإجمالي مع AB</p>
                <div className="text-4xl font-bold text-primary mb-2">
                  {formatCurrency(abWallet?.netCash || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  (المدفوعات الفعلية من الزبائن - المدفوع للشركات - المدفوع للوسطاء - المصاريف)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards - 4 columns */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {loading || profitLoading ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : (
            <>
              {/* Total Profit */}
              <Card className="border-l-4 border-l-success">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    ربح AB الإجمالي
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">
                    {formatCurrency(profitSummary.netProfit)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    بعد خصم تكلفة الإلزامي
                  </p>
                </CardContent>
              </Card>

              {/* Company Debt */}
              <Card className="border-l-4 border-l-destructive">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    إجمالي مستحق للشركات
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {formatCurrency(abWallet?.companyDebt || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    شركات مباشرة فقط (بدون الوسطاء)
                  </p>
                </CardContent>
              </Card>

              {/* Broker Debt */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    إجمالي مستحق للوسطاء
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(abWallet?.brokerDebt || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    المتبقي للوسطاء
                  </p>
                </CardContent>
              </Card>

              {/* Total Expenses */}
              <Card className="border-l-4 border-l-warning">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    المصاريف الشهرية
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">
                    {formatCurrency(abWallet?.monthExpenses || 0)}
                  </div>
                  <Link to="/expenses" className="text-xs text-primary hover:underline mt-1 inline-block">
                    عرض كل المصاريف →
                  </Link>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Cash Flow Summary */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <ArrowDownRight className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المحصّل من الزبائن</p>
                  <p className="text-lg font-bold text-success">
                    {formatCurrency(abWallet?.totalCashIn || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <ArrowUpRight className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المدفوع للشركات</p>
                  <p className="text-lg font-bold text-destructive">
                    {formatCurrency(abWallet?.totalCompanyPayments || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ArrowUpRight className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المدفوع للوسطاء</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(abWallet?.totalBrokerPayments || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Receipt className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي المصاريف</p>
                  <p className="text-lg font-bold text-warning">
                    {formatCurrency(abWallet?.totalExpenses || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Details */}
        <Tabs defaultValue="companies" className="space-y-4">
          <TabsList>
            <TabsTrigger value="companies">أرصدة الشركات</TabsTrigger>
            <TabsTrigger value="ledger">سجل الحركات</TabsTrigger>
          </TabsList>

          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  مستحقات شركات التأمين
                </CardTitle>
                <CardDescription>
                  المبالغ المستحقة لكل شركة تأمين بناءً على البوالص
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : companyBalances.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2 text-success" />
                    <p>لا توجد مستحقات قائمة</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الشركة</TableHead>
                        <TableHead className="text-left">إجمالي المستحق</TableHead>
                        <TableHead className="text-left">تم السداد</TableHead>
                        <TableHead className="text-left">المتبقي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyBalances.map((company) => (
                        <TableRow key={company.companyId}>
                          <TableCell className="font-medium">
                            {company.companyNameAr}
                          </TableCell>
                          <TableCell className="text-left">
                            {formatCurrency(company.totalPayable)}
                          </TableCell>
                          <TableCell className="text-left text-success">
                            {formatCurrency(company.totalPaid)}
                          </TableCell>
                          <TableCell className="text-left">
                            <Badge variant={company.outstanding > 0 ? "destructive" : "secondary"}>
                              {formatCurrency(company.outstanding)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ledger">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  سجل القيود المحاسبية
                </CardTitle>
                <CardDescription>
                  آخر 50 حركة في دفتر الأستاذ
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : recentEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-2" />
                    <p>لا توجد قيود بعد</p>
                    <p className="text-sm">ستظهر القيود تلقائياً مع كل حركة جديدة</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>النوع</TableHead>
                          <TableHead>الفئة</TableHead>
                          <TableHead className="text-left">المبلغ</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{formatDate(entry.transactionDate)}</TableCell>
                            <TableCell>{referenceTypeLabels[entry.referenceType] || entry.referenceType}</TableCell>
                            <TableCell>{categoryLabels[entry.category] || entry.category}</TableCell>
                            <TableCell className="text-left">
                              <span className={entry.amount >= 0 ? 'text-success' : 'text-destructive'}>
                                {entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(entry.status)}>
                                {entry.status === 'posted' ? 'مُرحّل' : entry.status === 'reversed' ? 'ملغي' : entry.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
