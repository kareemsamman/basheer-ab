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
  TrendingDown, 
  Building2, 
  Users, 
  Wallet,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  Receipt,
  Calculator,
  FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useProfitSummary } from "@/hooks/useProfitSummary";

interface LedgerSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  companyPayables: number;
  brokerPayables: number;
  brokerReceivables: number;
  customerRefundsDue: number;
}

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
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary | null>(null);
  const [companyBalances, setCompanyBalances] = useState<CompanyBalance[]>([]);
  const [recentEntries, setRecentEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch ledger summary using RPC
      const { data: summaryData, error: summaryError } = await supabase
        .rpc('get_ab_balance');
      
      if (summaryError) throw summaryError;
      
      if (summaryData && summaryData.length > 0) {
        const row = summaryData[0];
        setLedgerSummary({
          totalIncome: Number(row.total_income) || 0,
          totalExpense: Number(row.total_expense) || 0,
          netBalance: Number(row.net_balance) || 0,
          companyPayables: Number(row.company_payables) || 0,
          brokerPayables: Number(row.broker_payables) || 0,
          brokerReceivables: Number(row.broker_receivables) || 0,
          customerRefundsDue: Number(row.customer_refunds_due) || 0,
        });
      }

      // Fetch company balances - exclude broker-linked companies
      const { data: companies, error: companiesError } = await supabase
        .from('insurance_companies')
        .select('id, name, name_ar, broker_id')
        .eq('active', true)
        .is('broker_id', null); // Only direct companies, not broker-linked
      
      if (companiesError) throw companiesError;
      
      // For each company, get balance
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
    return `₪${Math.abs(amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}`;
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
        {/* Summary Cards - AB Wallet Overview */}
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
              {/* Net Profit (Year) */}
              <Card className="border-l-4 border-l-success">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    صافي الربح (السنة)
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

              {/* Company Payables - Excluding broker-linked */}
              <Card className="border-l-4 border-l-destructive">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    مستحق للشركات
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {formatCurrency(profitSummary.totalCompanyPaymentDue)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    شركات مباشرة فقط (بدون الوسطاء)
                  </p>
                </CardContent>
              </Card>

              {/* Broker Balance */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    صافي حساب الوسطاء
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {ledgerSummary ? (
                      ledgerSummary.brokerReceivables - ledgerSummary.brokerPayables >= 0 ? (
                        <span className="text-success">+{formatCurrency(ledgerSummary.brokerReceivables - ledgerSummary.brokerPayables)}</span>
                      ) : (
                        <span className="text-destructive">-{formatCurrency(Math.abs(ledgerSummary.brokerReceivables - ledgerSummary.brokerPayables))}</span>
                      )
                    ) : '₪0'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    + لنا | - علينا
                  </p>
                </CardContent>
              </Card>

              {/* Customer Refunds */}
              <Card className="border-l-4 border-l-warning">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    مرتجعات للعملاء
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">
                    {ledgerSummary ? formatCurrency(ledgerSummary.customerRefundsDue) : '₪0'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    مبالغ مستحقة للعملاء
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Second Row - Monthly Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                ربح الشهر الحالي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-success">
                {formatCurrency(profitSummary.monthNetProfit)}
              </div>
              <p className="text-xs text-muted-foreground">
                بعد خصم: {formatCurrency(profitSummary.monthElzamiCost)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Banknote className="h-4 w-4 text-success" />
                إيرادات الشهر
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {formatCurrency(profitSummary.monthRevenue)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                تكلفة الإلزامي (السنة)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-warning">
                {formatCurrency(profitSummary.totalElzamiCost)}
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
                          <TableHead>التصنيف</TableHead>
                          <TableHead>الطرف</TableHead>
                          <TableHead className="text-left">المبلغ</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{formatDate(entry.transactionDate)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {referenceTypeLabels[entry.referenceType] || entry.referenceType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {categoryLabels[entry.category] || entry.category}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {entry.counterpartyType === 'insurance_company' && 'شركة تأمين'}
                              {entry.counterpartyType === 'customer' && 'عميل'}
                              {entry.counterpartyType === 'broker' && 'وسيط'}
                              {entry.counterpartyType === 'internal' && 'داخلي'}
                            </TableCell>
                            <TableCell className="text-left">
                              <span className={`flex items-center gap-1 ${entry.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {entry.amount >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {formatCurrency(entry.amount)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(entry.status)}>
                                {entry.status === 'posted' && 'مرحّل'}
                                {entry.status === 'reversed' && 'معكوس'}
                                {entry.status === 'pending' && 'معلق'}
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

        {/* Info Card */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="rounded-full bg-primary/10 p-2 h-fit">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-medium">نظام المحفظة الموحد (AB Ledger)</h4>
                <p className="text-sm text-muted-foreground">
                  كل حركة مالية في النظام تُسجل تلقائياً كقيد محاسبي. يشمل ذلك:
                  إنشاء البوالص، استلام الدفعات، إلغاء البوالص، الشيكات الراجعة، تسويات الوسطاء، ومرتجعات العملاء.
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>ملاحظة:</strong> تأمينات الإلزامي لا تُحسب ضمن الأرباح، بل تُسجل كتكلفة عمولة سالبة.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
