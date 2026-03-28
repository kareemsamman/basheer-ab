import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";
import {
  BookOpen, FileText, RotateCcw, CreditCard, PlusCircle,
  Download, DollarSign, TrendingUp, TrendingDown, Landmark,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInsuranceTypeLabel } from "@/lib/insuranceTypes";

const PAGE_SIZE = 25;

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB") : "-";
const formatCurrency = (n: number) => `₪${n.toLocaleString()}`;

function getDefaultDateRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`,
  };
}

// ─── Types ───────────────────────────────────────────────

interface PolicyIssuance {
  id: string;
  client_name: string;
  car_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  insurance_price: number;
  car_type: string | null;
  created_at: string;
}

interface RefundRow {
  id: string;
  client_name: string;
  car_number: string | null;
  insurance_price: number;
  refund_amount: number;
  reason: string;
  refund_date: string;
}

interface PaymentRow {
  id: string;
  entity_name: string;
  voucher_type: string;
  amount: number;
  expense_date: string;
  description: string | null;
  reference_number: string | null;
}

interface ManualTx {
  id: string;
  amount: number;
  transaction_date: string;
  description: string | null;
  category: string;
  reference_type: string;
}

// ─── Component ───────────────────────────────────────────

export default function Accounting() {
  const { user } = useAuth();
  const defaults = getDefaultDateRange();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);

  // Tab data
  const [activeTab, setActiveTab] = useState("issuances");
  const [issuances, setIssuances] = useState<PolicyIssuance[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [manualTxs, setManualTxs] = useState<ManualTx[]>([]);

  // Loading
  const [issuancesLoading, setIssuancesLoading] = useState(true);
  const [refundsLoading, setRefundsLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [manualLoading, setManualLoading] = useState(true);

  // Summary
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [totalIssuances, setTotalIssuances] = useState(0);
  const [totalRefunds, setTotalRefunds] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);

  // Pagination
  const [issuancesPage, setIssuancesPage] = useState(0);
  const [issuancesTotal, setIssuancesTotal] = useState(0);
  const [refundsPage, setRefundsPage] = useState(0);
  const [refundsTotal, setRefundsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(0);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [manualPage, setManualPage] = useState(0);
  const [manualTotal, setManualTotal] = useState(0);

  // New transaction dialog
  const [newTxOpen, setNewTxOpen] = useState(false);
  const [newTxType, setNewTxType] = useState<"income" | "expense">("income");
  const [newTxAmount, setNewTxAmount] = useState("");
  const [newTxDate, setNewTxDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTxDesc, setNewTxDesc] = useState("");
  const [savingTx, setSavingTx] = useState(false);

  // ─── Fetchers ────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      // Issuances total
      const { data: iData } = await supabase
        .from("policies")
        .select("insurance_price")
        .gte("created_at", fromDate)
        .lte("created_at", toDate + "T23:59:59")
        .is("deleted_at", null)
        .eq("cancelled", false)
        .eq("transferred", false);
      const isTotal = (iData || []).reduce((s, p) => s + (p.insurance_price || 0), 0);
      setTotalIssuances(isTotal);

      // Refunds total
      const { data: rData } = await supabase
        .from("policies")
        .select("insurance_price")
        .gte("created_at", fromDate)
        .lte("created_at", toDate + "T23:59:59")
        .is("deleted_at", null)
        .or("cancelled.eq.true,transferred.eq.true");
      const refTotal = (rData || []).reduce((s, p) => s + (p.insurance_price || 0), 0);
      setTotalRefunds(refTotal);

      // Payments total
      const { data: pData } = await supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .eq("voucher_type", "payment");
      const payTotal = (pData || []).reduce((s, e) => s + (e.amount || 0), 0);
      setTotalPayments(payTotal);
    } catch {
      toast.error("فشل في تحميل الملخص");
    } finally {
      setSummaryLoading(false);
    }
  }, [fromDate, toDate]);

  const fetchIssuances = useCallback(async () => {
    setIssuancesLoading(true);
    try {
      const { count } = await supabase
        .from("policies")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromDate)
        .lte("created_at", toDate + "T23:59:59")
        .is("deleted_at", null)
        .eq("cancelled", false)
        .eq("transferred", false);
      setIssuancesTotal(count || 0);

      const { data, error } = await supabase
        .from("policies")
        .select("id, insurance_price, policy_type_parent, policy_type_child, created_at, client_id, car_id, clients(full_name), cars(car_number, car_type)")
        .gte("created_at", fromDate)
        .lte("created_at", toDate + "T23:59:59")
        .is("deleted_at", null)
        .eq("cancelled", false)
        .eq("transferred", false)
        .order("created_at", { ascending: false })
        .range(issuancesPage * PAGE_SIZE, (issuancesPage + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setIssuances(
        (data || []).map((p: any) => ({
          id: p.id,
          client_name: p.clients?.full_name || "-",
          car_number: p.cars?.car_number || null,
          policy_type_parent: p.policy_type_parent,
          policy_type_child: p.policy_type_child,
          insurance_price: p.insurance_price || 0,
          car_type: p.cars?.car_type || null,
          created_at: p.created_at,
        }))
      );
    } catch {
      toast.error("فشل في تحميل الإصدارات");
    } finally {
      setIssuancesLoading(false);
    }
  }, [fromDate, toDate, issuancesPage]);

  const fetchRefunds = useCallback(async () => {
    setRefundsLoading(true);
    try {
      const { count } = await supabase
        .from("policies")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromDate)
        .lte("created_at", toDate + "T23:59:59")
        .is("deleted_at", null)
        .or("cancelled.eq.true,transferred.eq.true");
      setRefundsTotal(count || 0);

      const { data, error } = await supabase
        .from("policies")
        .select("id, insurance_price, cancelled, transferred, created_at, clients(full_name), cars(car_number)")
        .gte("created_at", fromDate)
        .lte("created_at", toDate + "T23:59:59")
        .is("deleted_at", null)
        .or("cancelled.eq.true,transferred.eq.true")
        .order("created_at", { ascending: false })
        .range(refundsPage * PAGE_SIZE, (refundsPage + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setRefunds(
        (data || []).map((p: any) => ({
          id: p.id,
          client_name: p.clients?.full_name || "-",
          car_number: p.cars?.car_number || null,
          insurance_price: p.insurance_price || 0,
          refund_amount: p.insurance_price || 0,
          reason: p.cancelled ? "إلغاء" : "تحويل",
          refund_date: p.created_at,
        }))
      );
    } catch {
      toast.error("فشل في تحميل المرتجعات");
    } finally {
      setRefundsLoading(false);
    }
  }, [fromDate, toDate, refundsPage]);

  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const { count } = await supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .eq("voucher_type", "payment");
      setPaymentsTotal(count || 0);

      const { data, error } = await supabase
        .from("expenses")
        .select("id, amount, expense_date, description, reference_number, voucher_type, entity_type, entity_id, insurance_companies(name_ar, name), brokers(name)")
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .eq("voucher_type", "payment")
        .order("expense_date", { ascending: false })
        .range(paymentsPage * PAGE_SIZE, (paymentsPage + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setPayments(
        (data || []).map((e: any) => ({
          id: e.id,
          entity_name: e.insurance_companies?.name_ar || e.insurance_companies?.name || e.brokers?.name || "-",
          voucher_type: "سند صرف",
          amount: e.amount || 0,
          expense_date: e.expense_date,
          description: e.description,
          reference_number: e.reference_number,
        }))
      );
    } catch {
      toast.error("فشل في تحميل الدفعات");
    } finally {
      setPaymentsLoading(false);
    }
  }, [fromDate, toDate, paymentsPage]);

  const fetchManualTxs = useCallback(async () => {
    setManualLoading(true);
    try {
      const { count } = await supabase
        .from("ab_ledger")
        .select("id", { count: "exact", head: true })
        .eq("reference_type", "manual_adjustment")
        .eq("status", "posted")
        .gte("transaction_date", fromDate)
        .lte("transaction_date", toDate);
      setManualTotal(count || 0);

      const { data, error } = await supabase
        .from("ab_ledger")
        .select("id, amount, transaction_date, description, category, reference_type")
        .eq("reference_type", "manual_adjustment")
        .eq("status", "posted")
        .gte("transaction_date", fromDate)
        .lte("transaction_date", toDate)
        .order("transaction_date", { ascending: false })
        .range(manualPage * PAGE_SIZE, (manualPage + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setManualTxs(data || []);
    } catch {
      toast.error("فشل في تحميل الحركات اليدوية");
    } finally {
      setManualLoading(false);
    }
  }, [fromDate, toDate, manualPage]);

  // ─── Effects ─────────────────────────────────────────

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  useEffect(() => {
    if (activeTab === "issuances") fetchIssuances();
  }, [activeTab, fetchIssuances]);

  useEffect(() => {
    if (activeTab === "refunds") fetchRefunds();
  }, [activeTab, fetchRefunds]);

  useEffect(() => {
    if (activeTab === "payments") fetchPayments();
  }, [activeTab, fetchPayments]);

  useEffect(() => {
    if (activeTab === "manual") fetchManualTxs();
  }, [activeTab, fetchManualTxs]);

  // ─── New Transaction ────────────────────────────────

  const handleSaveTx = async () => {
    if (!newTxAmount || parseFloat(newTxAmount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }
    if (!newTxDesc.trim()) {
      toast.error("يرجى إدخال البيان");
      return;
    }

    setSavingTx(true);
    try {
      const amount = newTxType === "expense" ? -Math.abs(parseFloat(newTxAmount)) : Math.abs(parseFloat(newTxAmount));
      const { error } = await supabase.from("ab_ledger").insert({
        amount,
        transaction_date: newTxDate,
        description: newTxDesc.trim(),
        reference_type: "manual_adjustment",
        reference_id: crypto.randomUUID(),
        category: newTxType === "income" ? "premium_income" : "commission_expense",
        counterparty_type: "internal",
        status: "posted",
        created_by_admin_id: user?.id,
      });

      if (error) throw error;

      toast.success("تم إضافة الحركة بنجاح");
      setNewTxOpen(false);
      setNewTxAmount("");
      setNewTxDesc("");
      setNewTxType("income");
      fetchManualTxs();
      fetchSummary();
    } catch {
      toast.error("فشل في إضافة الحركة");
    } finally {
      setSavingTx(false);
    }
  };

  // ─── Helpers ─────────────────────────────────────────

  const carTypeLabels: Record<string, string> = {
    car: "خصوصي",
    cargo: "شحن",
    small: "صغيرة",
    taxi: "تاكسي",
    tjeradown4: "تجاري < 4 طن",
    tjeraup4: "تجاري > 4 طن",
  };

  const netBalance = totalIssuances - totalRefunds - totalPayments;

  function Paginator({ page, setPage, total }: { page: number; setPage: (fn: (p: number) => number) => void; total: number }) {
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    return (
      <div className="flex items-center justify-between p-4 border-t">
        <p className="text-sm text-muted-foreground">إجمالي: {total}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  function SkeletonRows({ cols }: { cols: number }) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────

  return (
    <MainLayout>
      <Helmet><title>المحاسبة | AB Insurance CRM</title></Helmet>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            المحاسبة والتقارير المالية
          </h1>
          <p className="text-muted-foreground">إدارة الحسابات والإصدارات والمرتجعات والدفعات</p>
        </div>

        {/* Global Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setIssuancesPage(0); setRefundsPage(0); setPaymentsPage(0); setManualPage(0); }} className="w-[160px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setIssuancesPage(0); setRefundsPage(0); setPaymentsPage(0); setManualPage(0); }} className="w-[160px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">شهر</Label>
              <Input
                type="month"
                value={fromDate.slice(0, 7)}
                onChange={e => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  const lastDay = new Date(y, m, 0).getDate();
                  setFromDate(`${e.target.value}-01`);
                  setToDate(`${e.target.value}-${String(lastDay).padStart(2, "0")}`);
                  setIssuancesPage(0); setRefundsPage(0); setPaymentsPage(0); setManualPage(0);
                }}
                className="w-[160px]"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              تصدير التقرير
            </Button>
          </div>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الإصدارات</p>
                {summaryLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
                  <p className="text-2xl font-bold text-primary">{formatCurrency(totalIssuances)}</p>
                )}
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المرتجعات</p>
                {summaryLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(totalRefunds)}</p>
                )}
              </div>
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المدفوعات</p>
                {summaryLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalPayments)}</p>
                )}
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">صافي حساب الشركة</p>
                {summaryLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
                  <p className={cn("text-2xl font-bold", netBalance >= 0 ? "text-green-600" : "text-destructive")}>
                    {formatCurrency(netBalance)}
                  </p>
                )}
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Landmark className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="issuances" className="gap-2 text-xs sm:text-sm">
              <FileText className="h-4 w-4 hidden sm:block" />
              إصدارات البوليصة
            </TabsTrigger>
            <TabsTrigger value="refunds" className="gap-2 text-xs sm:text-sm">
              <RotateCcw className="h-4 w-4 hidden sm:block" />
              مرتجعات
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2 text-xs sm:text-sm">
              <CreditCard className="h-4 w-4 hidden sm:block" />
              دفعات - سند صرف
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2 text-xs sm:text-sm">
              <BookOpen className="h-4 w-4 hidden sm:block" />
              حركة يدوية
            </TabsTrigger>
          </TabsList>

          {/* ─── Tab 1: Issuances ─── */}
          <TabsContent value="issuances">
            <Card className="overflow-hidden">
              {issuancesLoading ? <SkeletonRows cols={6} /> : issuances.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد إصدارات في هذه الفترة</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-right">#</TableHead>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-right">رقم السيارة</TableHead>
                          <TableHead className="text-right">نوع البوليصة</TableHead>
                          <TableHead className="text-right">المبلغ</TableHead>
                          <TableHead className="text-right">نوع المركبة</TableHead>
                          <TableHead className="text-right">تاريخ الإصدار</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {issuances.map((p, i) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-muted-foreground">{issuancesPage * PAGE_SIZE + i + 1}</TableCell>
                            <TableCell className="font-medium">{p.client_name}</TableCell>
                            <TableCell className="font-mono">{p.car_number || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {getInsuranceTypeLabel(p.policy_type_parent as any, p.policy_type_child as any)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-bold">{formatCurrency(p.insurance_price)}</TableCell>
                            <TableCell>{p.car_type ? carTypeLabels[p.car_type] || p.car_type : "-"}</TableCell>
                            <TableCell className="font-mono">{formatDate(p.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Paginator page={issuancesPage} setPage={setIssuancesPage} total={issuancesTotal} />
                </>
              )}
            </Card>
          </TabsContent>

          {/* ─── Tab 2: Refunds ─── */}
          <TabsContent value="refunds">
            <Card className="overflow-hidden">
              {refundsLoading ? <SkeletonRows cols={6} /> : refunds.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد مرتجعات في هذه الفترة</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-right">#</TableHead>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-right">رقم السيارة</TableHead>
                          <TableHead className="text-right">مبلغ البوليصة</TableHead>
                          <TableHead className="text-right">مبلغ الإرجاع</TableHead>
                          <TableHead className="text-right">السبب</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {refunds.map((r, i) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-muted-foreground">{refundsPage * PAGE_SIZE + i + 1}</TableCell>
                            <TableCell className="font-medium">{r.client_name}</TableCell>
                            <TableCell className="font-mono">{r.car_number || "-"}</TableCell>
                            <TableCell>{formatCurrency(r.insurance_price)}</TableCell>
                            <TableCell className="font-bold text-destructive">{formatCurrency(r.refund_amount)}</TableCell>
                            <TableCell>
                              <Badge variant={r.reason === "إلغاء" ? "destructive" : "secondary"} className="text-xs">
                                {r.reason}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono">{formatDate(r.refund_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Paginator page={refundsPage} setPage={setRefundsPage} total={refundsTotal} />
                </>
              )}
            </Card>
          </TabsContent>

          {/* ─── Tab 3: Payments ─── */}
          <TabsContent value="payments">
            <Card className="overflow-hidden">
              {paymentsLoading ? <SkeletonRows cols={5} /> : payments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد دفعات في هذه الفترة</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-right">#</TableHead>
                          <TableHead className="text-right">الجهة</TableHead>
                          <TableHead className="text-right">النوع</TableHead>
                          <TableHead className="text-right">المبلغ</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">ملاحظات / رقم مرجعي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((p, i) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-muted-foreground">{paymentsPage * PAGE_SIZE + i + 1}</TableCell>
                            <TableCell className="font-medium">{p.entity_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{p.voucher_type}</Badge>
                            </TableCell>
                            <TableCell className="font-bold">{formatCurrency(p.amount)}</TableCell>
                            <TableCell className="font-mono">{formatDate(p.expense_date)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {p.reference_number && <span className="font-mono ml-2">#{p.reference_number}</span>}
                              {p.description || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Paginator page={paymentsPage} setPage={setPaymentsPage} total={paymentsTotal} />
                </>
              )}
            </Card>
          </TabsContent>

          {/* ─── Tab 4: Manual Transactions ─── */}
          <TabsContent value="manual">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setNewTxOpen(true)} className="gap-2">
                  <PlusCircle className="h-4 w-4" />
                  حركة جديدة
                </Button>
              </div>

              <Card className="overflow-hidden">
                {manualLoading ? <SkeletonRows cols={5} /> : manualTxs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">لا توجد حركات يدوية في هذه الفترة</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-right">#</TableHead>
                            <TableHead className="text-right">النوع</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">البيان</TableHead>
                            <TableHead className="text-right">الرصيد التراكمي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            let runningBalance = 0;
                            // Sort ascending for running balance, then display in table order
                            const sorted = [...manualTxs].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
                            const balances = sorted.map(tx => {
                              runningBalance += tx.amount;
                              return { id: tx.id, balance: runningBalance };
                            });
                            const balanceMap = Object.fromEntries(balances.map(b => [b.id, b.balance]));

                            return manualTxs.map((tx, i) => (
                              <TableRow key={tx.id}>
                                <TableCell className="text-muted-foreground">{manualPage * PAGE_SIZE + i + 1}</TableCell>
                                <TableCell>
                                  <Badge variant={tx.amount >= 0 ? "default" : "destructive"} className="text-xs">
                                    {tx.amount >= 0 ? "دخل" : "مصروف"}
                                  </Badge>
                                </TableCell>
                                <TableCell className={cn("font-bold", tx.amount >= 0 ? "text-green-600" : "text-destructive")}>
                                  {formatCurrency(Math.abs(tx.amount))}
                                </TableCell>
                                <TableCell className="font-mono">{formatDate(tx.transaction_date)}</TableCell>
                                <TableCell className="max-w-[300px]">{tx.description || "-"}</TableCell>
                                <TableCell className={cn("font-bold", (balanceMap[tx.id] || 0) >= 0 ? "text-green-600" : "text-destructive")}>
                                  {formatCurrency(balanceMap[tx.id] || 0)}
                                </TableCell>
                              </TableRow>
                            ));
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                    <Paginator page={manualPage} setPage={setManualPage} total={manualTotal} />
                  </>
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* New Transaction Dialog */}
      <Dialog open={newTxOpen} onOpenChange={setNewTxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة حركة يدوية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>النوع</Label>
              <Select value={newTxType} onValueChange={(v: "income" | "expense") => setNewTxType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">دخل</SelectItem>
                  <SelectItem value="expense">مصروف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المبلغ</Label>
              <Input type="number" min="0" step="0.01" value={newTxAmount} onChange={e => setNewTxAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={newTxDate} onChange={e => setNewTxDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>البيان</Label>
              <Textarea value={newTxDesc} onChange={e => setNewTxDesc(e.target.value)} placeholder="وصف الحركة..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTxOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveTx} disabled={savingTx}>
              {savingTx ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
