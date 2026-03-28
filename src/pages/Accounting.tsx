import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  BookOpen, FileText, RotateCcw, PlusCircle,
  Download, TrendingUp, TrendingDown, Landmark,
  ChevronLeft, ChevronRight, Building2, Users, UserPlus,
  ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";

// ─── Constants ───────────────────────────────────────────

const PAGE_SIZE = 25;
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB") : "-";
const fmtCur = (n: number) => `₪${Math.abs(n).toLocaleString()}`;

const typeLabel: Record<string, string> = {
  THIRD: "ثالث", FULL: "شامل", THIRD_FULL: "ثالث/شامل",
  ROAD_SERVICE: "خدمات الطريق", ACCIDENT_FEE_EXEMPTION: "إعفاء رسوم حادث",
  HEALTH: "تأمين صحي", LIFE: "تأمين حياة", PROPERTY: "تأمين ممتلكات",
  TRAVEL: "تأمين سفر", BUSINESS: "تأمين أعمال", OTHER: "أخرى",
};

function policyTypeDisplay(parent: string, child: string | null): string {
  if (parent === "ELZAMI") return "";
  if (parent === "THIRD_FULL" && child) return typeLabel[child] || child;
  return typeLabel[parent] || parent;
}

function getDefaultRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, "0")}` };
}

type EntityType = "company" | "broker" | "other";
type TabType = "all" | "issuances" | "refunds" | "payment" | "receipt";

interface Row {
  id: string;
  tab: "issuance" | "refund" | "payment" | "receipt";
  client_name: string;
  car_number: string | null;
  types: string[];
  amount: number;
  date: string;
  description: string;
  company_name: string;
  extra: string;
}

// ─── Component ───────────────────────────────────────────

export default function Accounting() {
  const { user } = useAuth();
  const def = getDefaultRange();

  // Filters
  const [entityType, setEntityType] = useState<EntityType>("company");
  const [companies, setCompanies] = useState<{ id: string; name: string; name_ar: string | null }[]>([]);
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("all");
  const [selectedBrokerId, setSelectedBrokerId] = useState("all");
  const [otherName, setOtherName] = useState("");
  const [policyTypeFilter, setPolicyTypeFilter] = useState("all");
  const [dateMode, setDateMode] = useState<"month" | "range">("month");
  const [fromDate, setFromDate] = useState(def.from);
  const [toDate, setToDate] = useState(def.to);
  const [selectedMonth, setSelectedMonth] = useState(def.from.slice(0, 7));
  const [activeTab, setActiveTab] = useState<TabType>("all");

  // Data
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const navigate = useNavigate();

  // Add dialog (only for "other" entity type - manual entries)
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"income" | "expense">("income");
  const [addAmount, setAddAmount] = useState("");
  const [addDate, setAddDate] = useState(new Date().toISOString().split("T")[0]);
  const [addDesc, setAddDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Load reference data
  useEffect(() => {
    supabase.from("insurance_companies").select("id, name, name_ar").eq("active", true).order("name_ar").then(({ data }) => setCompanies(data || []));
    supabase.from("brokers").select("id, name").order("name").then(({ data }) => setBrokers(data || []));
  }, []);

  // ─── Fetch data ──────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const results: Row[] = [];

    try {
      if (entityType === "company") {
        // ISSUANCES
        let q = supabase.from("policies")
          .select("id, insurance_price, policy_type_parent, policy_type_child, created_at, group_id, company_id, clients(full_name), cars(car_number), insurance_companies(name_ar, name)")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59")
          .is("deleted_at", null).eq("cancelled", false).eq("transferred", false)
          .neq("policy_type_parent", "ELZAMI");
        if (selectedCompanyId !== "all") q = q.eq("company_id", selectedCompanyId);
        if (policyTypeFilter !== "all") {
          if (policyTypeFilter === "THIRD" || policyTypeFilter === "FULL")
            q = q.eq("policy_type_parent", "THIRD_FULL").eq("policy_type_child", policyTypeFilter);
          else q = q.eq("policy_type_parent", policyTypeFilter);
        }
        const { data: iss } = await q.order("created_at", { ascending: false });

        const gMap = new Map<string, Row>();
        for (const p of iss || []) {
          const k = p.group_id || p.id;
          const lbl = policyTypeDisplay(p.policy_type_parent, p.policy_type_child);
          const co = (p as any).insurance_companies?.name_ar || (p as any).insurance_companies?.name || "";
          if (gMap.has(k)) {
            const e = gMap.get(k)!;
            e.amount += p.insurance_price || 0;
            if (lbl && !e.types.includes(lbl)) e.types.push(lbl);
          } else {
            gMap.set(k, { id: k, tab: "issuance", client_name: (p as any).clients?.full_name || "-", car_number: (p as any).cars?.car_number || null, types: lbl ? [lbl] : [], amount: p.insurance_price || 0, date: p.created_at, description: "", company_name: co, extra: "" });
          }
        }
        results.push(...gMap.values());

        // REFUNDS: cancelled
        let rq = supabase.from("policies")
          .select("id, insurance_price, cancellation_date, created_at, clients(full_name), cars(car_number), insurance_companies(name_ar, name)")
          .eq("cancelled", true).neq("policy_type_parent", "ELZAMI").is("deleted_at", null)
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (selectedCompanyId !== "all") rq = rq.eq("company_id", selectedCompanyId);
        const { data: refs } = await rq;
        for (const p of refs || []) {
          results.push({ id: p.id, tab: "refund", client_name: (p as any).clients?.full_name || "-", car_number: (p as any).cars?.car_number || null, types: [], amount: p.insurance_price || 0, date: p.cancellation_date || p.created_at, description: "إلغاء بوليصة", company_name: (p as any).insurance_companies?.name_ar || (p as any).insurance_companies?.name || "", extra: "" });
        }

        // REFUNDS: returned cheques
        const { data: chqs } = await supabase.from("policy_payments")
          .select("id, amount, payment_date, cheque_number, policies(company_id, clients(full_name), cars(car_number), insurance_companies(name_ar, name))")
          .eq("refused", true).eq("payment_type", "cheque")
          .gte("payment_date", fromDate).lte("payment_date", toDate);
        for (const c of chqs || []) {
          const pol = (c as any).policies;
          if (selectedCompanyId !== "all" && pol?.company_id !== selectedCompanyId) continue;
          results.push({ id: c.id, tab: "refund", client_name: pol?.clients?.full_name || "-", car_number: pol?.cars?.car_number || null, types: [], amount: c.amount || 0, date: c.payment_date, description: `شيك مرتجع${c.cheque_number ? ` #${c.cheque_number}` : ""}`, company_name: pol?.insurance_companies?.name_ar || pol?.insurance_companies?.name || "", extra: "" });
        }

        // REFUNDS: customer wallet (negative = money owed)
        const { data: wallets } = await supabase.from("customer_wallet_transactions")
          .select("id, amount, created_at, description, clients(full_name)")
          .lt("amount", 0).gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        for (const w of wallets || []) {
          results.push({ id: w.id, tab: "refund", client_name: (w as any).clients?.full_name || "-", car_number: null, types: [], amount: Math.abs(w.amount), date: w.created_at, description: w.description || "رصيد مستحق للعميل", company_name: "", extra: "" });
        }

        // PAYMENTS: expenses to company
        let pq = supabase.from("expenses")
          .select("id, amount, expense_date, description, reference_number, payment_method, insurance_companies(name_ar, name)")
          .eq("voucher_type", "payment").eq("entity_type", "company")
          .gte("expense_date", fromDate).lte("expense_date", toDate);
        if (selectedCompanyId !== "all") pq = pq.eq("entity_id", selectedCompanyId);
        const { data: pays } = await pq;
        for (const e of pays || []) {
          results.push({ id: e.id, tab: "payment", client_name: "", car_number: null, types: [], amount: e.amount || 0, date: e.expense_date, description: e.description || "سند صرف", company_name: (e as any).insurance_companies?.name_ar || (e as any).insurance_companies?.name || "", extra: e.reference_number ? `#${e.reference_number}` : "" });
        }

        // PAYMENTS: company settlements (from company wallet page)
        let csq = supabase.from("company_settlements")
          .select("id, total_amount, settlement_date, notes, payment_type, cheque_number, insurance_companies(name_ar, name)")
          .eq("status", "completed")
          .gte("settlement_date", fromDate).lte("settlement_date", toDate);
        if (selectedCompanyId !== "all") csq = csq.eq("company_id", selectedCompanyId);
        const { data: settlements } = await csq;
        for (const s of settlements || []) {
          const payMethod = s.payment_type === "cheque" ? `شيك${s.cheque_number ? ` #${s.cheque_number}` : ""}` : s.payment_type === "bank_transfer" ? "تحويل بنكي" : s.payment_type || "";
          results.push({ id: s.id, tab: "payment", client_name: "", car_number: null, types: [], amount: s.total_amount || 0, date: s.settlement_date, description: s.notes || "تسوية شركة", company_name: (s as any).insurance_companies?.name_ar || (s as any).insurance_companies?.name || "", extra: payMethod });
        }

      } else if (entityType === "broker") {
        // BROKER ISSUANCES
        let bq = supabase.from("policies")
          .select("id, insurance_price, policy_type_parent, policy_type_child, created_at, group_id, broker_id, clients(full_name), cars(car_number), insurance_companies(name_ar, name), brokers(name)")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59")
          .is("deleted_at", null).eq("cancelled", false).eq("transferred", false)
          .neq("policy_type_parent", "ELZAMI").not("broker_id", "is", null);
        if (selectedBrokerId !== "all") bq = bq.eq("broker_id", selectedBrokerId);
        if (selectedCompanyId !== "all") bq = bq.eq("company_id", selectedCompanyId);
        if (policyTypeFilter !== "all") {
          if (policyTypeFilter === "THIRD" || policyTypeFilter === "FULL")
            bq = bq.eq("policy_type_parent", "THIRD_FULL").eq("policy_type_child", policyTypeFilter);
          else bq = bq.eq("policy_type_parent", policyTypeFilter);
        }
        const { data: bPols } = await bq.order("created_at", { ascending: false });

        const bMap = new Map<string, Row>();
        for (const p of bPols || []) {
          const k = p.group_id || p.id;
          const lbl = policyTypeDisplay(p.policy_type_parent, p.policy_type_child);
          const co = (p as any).insurance_companies?.name_ar || (p as any).insurance_companies?.name || "";
          if (bMap.has(k)) {
            const e = bMap.get(k)!;
            e.amount += p.insurance_price || 0;
            if (lbl && !e.types.includes(lbl)) e.types.push(lbl);
          } else {
            bMap.set(k, { id: k, tab: "issuance", client_name: (p as any).clients?.full_name || "-", car_number: (p as any).cars?.car_number || null, types: lbl ? [lbl] : [], amount: p.insurance_price || 0, date: p.created_at, description: "", company_name: co, extra: (p as any).brokers?.name || "" });
          }
        }
        results.push(...bMap.values());

        // BROKER EXPENSES (payment + receipt)
        let beq = supabase.from("expenses")
          .select("id, amount, expense_date, description, reference_number, voucher_type, brokers(name)")
          .eq("entity_type", "broker").gte("expense_date", fromDate).lte("expense_date", toDate);
        if (selectedBrokerId !== "all") beq = beq.eq("entity_id", selectedBrokerId);
        const { data: bExps } = await beq;
        for (const e of bExps || []) {
          results.push({ id: e.id, tab: e.voucher_type === "receipt" ? "receipt" : "payment", client_name: "", car_number: null, types: [], amount: e.amount || 0, date: e.expense_date, description: e.description || (e.voucher_type === "receipt" ? "سند قبض" : "سند صرف"), company_name: "", extra: (e as any).brokers?.name || "" });
        }

      } else {
        // OTHER: manual ledger
        const { data: oData } = await supabase.from("ab_ledger")
          .select("id, amount, transaction_date, description, category")
          .eq("reference_type", "manual_adjustment").eq("status", "posted").eq("counterparty_type", "internal")
          .gte("transaction_date", fromDate).lte("transaction_date", toDate)
          .order("transaction_date", { ascending: false });
        for (const tx of oData || []) {
          results.push({ id: tx.id, tab: tx.amount >= 0 ? "receipt" : "payment", client_name: "", car_number: null, types: [], amount: Math.abs(tx.amount), date: tx.transaction_date, description: tx.description || (tx.amount >= 0 ? "دخل" : "مصروف"), company_name: "", extra: "" });
        }
      }

      setRows(results);
    } catch (err) {
      console.error("Error:", err);
      toast.error("فشل في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [entityType, selectedCompanyId, selectedBrokerId, policyTypeFilter, fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered + paginated
  const filtered = useMemo(() => {
    if (activeTab === "all") return rows;
    const map: Record<string, string> = { issuances: "issuance", refunds: "refund", payment: "payment", receipt: "receipt" };
    return rows.filter(r => r.tab === map[activeTab]);
  }, [rows, activeTab]);

  useEffect(() => setPage(0), [activeTab, entityType, selectedCompanyId, selectedBrokerId, fromDate, toDate]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Summary
  const summary = useMemo(() => {
    const i = rows.filter(r => r.tab === "issuance").reduce((s, r) => s + r.amount, 0);
    const rf = rows.filter(r => r.tab === "refund").reduce((s, r) => s + r.amount, 0);
    const p = rows.filter(r => r.tab === "payment").reduce((s, r) => s + r.amount, 0);
    const rc = rows.filter(r => r.tab === "receipt").reduce((s, r) => s + r.amount, 0);
    return { issuances: i, refunds: rf, payments: p, receipts: rc, net: i - rf - p + rc };
  }, [rows]);

  const showReceipt = entityType === "broker" || entityType === "other";

  // Save manual entry (only for "other" entity type)
  const handleSave = async () => {
    const amt = parseFloat(addAmount);
    if (!amt || amt <= 0) { toast.error("يرجى إدخال مبلغ صحيح"); return; }
    if (!addDesc.trim()) { toast.error("يرجى إدخال الوصف"); return; }
    setSaving(true);
    try {
      const sign = addType === "expense" ? -1 : 1;
      await supabase.from("ab_ledger").insert({
        amount: amt * sign, transaction_date: addDate, description: addDesc.trim(),
        reference_type: "manual_adjustment" as any, reference_id: crypto.randomUUID(),
        category: (sign > 0 ? "premium_income" : "commission_expense") as any,
        counterparty_type: "internal" as any, status: "posted" as any, created_by_admin_id: user?.id,
      });
      toast.success("تم الإضافة بنجاح");
      setAddOpen(false); setAddAmount(""); setAddDesc("");
      fetchData();
    } catch { toast.error("فشل في الإضافة"); }
    finally { setSaving(false); }
  };

  // ─── Render ──────────────────────────────────────────

  return (
    <MainLayout>
      <Helmet><title>المحاسبة | AB Insurance CRM</title></Helmet>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6 text-primary" />المحاسبة والتقارير المالية</h1>
          <p className="text-muted-foreground text-sm">إدارة حسابات الشركات والوسطاء</p>
        </div>

        {/* Entity Selector */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { t: "company" as EntityType, l: "شركة تأمين", I: Building2, d: "بدون إلزامي" },
            { t: "broker" as EntityType, l: "عن طريق وكيل", I: Users, d: "وسيط" },
            { t: "other" as EntityType, l: "شخص آخر", I: UserPlus, d: "كراج / جهة خارجية" },
          ]).map(e => (
            <button key={e.t} onClick={() => { setEntityType(e.t); setActiveTab("all"); setPage(0); setPolicyTypeFilter("all"); setSelectedCompanyId("all"); setSelectedBrokerId("all"); }}
              className={cn("rounded-xl border-2 p-4 text-center transition-all", entityType === e.t ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40")}>
              <e.I className={cn("h-6 w-6 mx-auto mb-2", entityType === e.t ? "text-primary" : "text-muted-foreground")} />
              <p className="font-bold text-sm">{e.l}</p>
              <p className="text-xs text-muted-foreground">{e.d}</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {entityType === "company" && (
              <div className="space-y-1"><Label className="text-xs">شركة التأمين</Label>
                <Select value={selectedCompanyId} onValueChange={v => { setSelectedCompanyId(v); setPage(0); }}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="اختر شركة..." /></SelectTrigger>
                  <SelectContent><SelectItem value="all">كل الشركات</SelectItem>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {entityType === "broker" && (<>
              <div className="space-y-1"><Label className="text-xs">الوكيل</Label>
                <Select value={selectedBrokerId} onValueChange={v => { setSelectedBrokerId(v); setPage(0); }}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="اختر وكيل..." /></SelectTrigger>
                  <SelectContent><SelectItem value="all">كل الوكلاء</SelectItem>{brokers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">شركة التأمين</Label>
                <Select value={selectedCompanyId} onValueChange={v => { setSelectedCompanyId(v); setPage(0); }}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="اختر شركة..." /></SelectTrigger>
                  <SelectContent><SelectItem value="all">كل الشركات</SelectItem>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>)}
            {entityType === "other" && (
              <div className="space-y-1"><Label className="text-xs">اسم الجهة</Label>
                <Input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="اسم الكراج / الجهة..." className="w-[200px]" />
              </div>
            )}
            {entityType !== "other" && (
              <div className="space-y-1"><Label className="text-xs">نوع البوليصة</Label>
                <Select value={policyTypeFilter} onValueChange={v => { setPolicyTypeFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    <SelectItem value="THIRD">ثالث</SelectItem><SelectItem value="FULL">شامل</SelectItem>
                    <SelectItem value="ROAD_SERVICE">خدمات الطريق</SelectItem>
                    <SelectItem value="ACCIDENT_FEE_EXEMPTION">إعفاء رسوم حادث</SelectItem>
                    <SelectItem value="HEALTH">تأمين صحي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Date mode selector */}
            <div className="space-y-1">
              <Label className="text-xs">الفترة</Label>
              <Select value={dateMode} onValueChange={(v: "month" | "range") => setDateMode(v)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">شهر محدد</SelectItem>
                  <SelectItem value="range">من تاريخ إلى تاريخ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateMode === "month" ? (
              <div className="space-y-1">
                <Label className="text-xs">الشهر</Label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedMonth(val);
                    const [y, m] = val.split("-").map(Number);
                    setFromDate(`${val}-01`);
                    setToDate(`${val}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`);
                    setPage(0);
                  }}
                  className="w-[160px]"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">من تاريخ</Label>
                  <ArabicDatePicker
                    value={fromDate}
                    onChange={(date) => { setFromDate(date); setPage(0); }}
                    compact
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">إلى تاريخ</Label>
                  <ArabicDatePicker
                    value={toDate}
                    onChange={(date) => { setToDate(date); setPage(0); }}
                    compact
                  />
                </div>
              </>
            )}

            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />تصدير</Button>
          </div>
        </Card>

        {/* Summary */}
        <div className={cn("grid gap-4", showReceipt ? "md:grid-cols-2 lg:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-4")}>
          {[
            { l: "إجمالي الإصدارات", v: summary.issuances, c: "text-primary", bg: "bg-primary/10", I: TrendingUp },
            { l: "إجمالي المرتجعات", v: summary.refunds, c: "text-destructive", bg: "bg-destructive/10", I: TrendingDown },
            { l: "سندات الصرف", v: summary.payments, c: "text-amber-600", bg: "bg-amber-100", I: ArrowUpRight },
            ...(showReceipt ? [{ l: "سندات القبض", v: summary.receipts, c: "text-blue-600", bg: "bg-blue-100", I: ArrowDownLeft }] : []),
            { l: "صافي الحساب", v: summary.net, c: summary.net >= 0 ? "text-green-600" : "text-destructive", bg: "bg-green-100", I: Landmark },
          ].map((s, i) => (
            <Card key={i} className="p-4"><div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">{s.l}</p>
                {loading ? <Skeleton className="h-7 w-20 mt-1" /> : <p className={cn("text-xl font-bold", s.c)}>{fmtCur(s.v)}</p>}
              </div>
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", s.bg)}><s.I className={cn("h-4 w-4", s.c)} /></div>
            </div></Card>
          ))}
        </div>

        {/* Tabs + Add Button */}
        <div className="flex items-center gap-3">
          <div className={cn("inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground flex-1 grid", showReceipt ? "grid-cols-5" : "grid-cols-4")}>
            {([
              { v: "all" as TabType, l: "الكل", I: null },
              { v: "issuances" as TabType, l: "إصدارات", I: FileText },
              { v: "refunds" as TabType, l: "مرتجعات", I: RotateCcw },
              { v: "payment" as TabType, l: "سند صرف", I: ArrowUpRight },
              ...(showReceipt ? [{ v: "receipt" as TabType, l: "سند قبض", I: ArrowDownLeft }] : []),
            ]).map(t => (
              <button
                key={t.v}
                onClick={() => { setActiveTab(t.v); setPage(0); }}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all gap-1",
                  activeTab === t.v ? "bg-background text-foreground shadow-sm" : "hover:bg-background/50"
                )}
              >
                {t.I && <t.I className="h-3.5 w-3.5 hidden sm:block" />}
                {t.l}
              </button>
            ))}
          </div>
          <Button onClick={() => {
            if (entityType === "other") {
              setAddOpen(true);
            } else {
              // Navigate to expenses page - same full dialog with payment lines
              navigate("/expenses");
            }
          }} className="gap-2 shrink-0"><PlusCircle className="h-4 w-4" />إضافة</Button>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {loading ? <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : pageRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">لا توجد بيانات</div>
          ) : (<>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50">
              <TableHead className="text-right w-10">#</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              {entityType !== "other" && <TableHead className="text-right">العميل</TableHead>}
              {entityType !== "other" && <TableHead className="text-right">رقم السيارة</TableHead>}
              {entityType !== "other" && <TableHead className="text-right">نوع البوليصة</TableHead>}
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">{entityType === "broker" ? "الشركة" : "الشركة"}</TableHead>
              {entityType === "broker" && <TableHead className="text-right">الوكيل</TableHead>}
              <TableHead className="text-right">البيان</TableHead>
            </TableRow></TableHeader>
            <TableBody>{pageRows.map((r, i) => {
              const badges: Record<string, { text: string; variant: "default" | "destructive" | "outline" | "secondary" }> = {
                issuance: { text: "إصدار", variant: "default" }, refund: { text: "مرتجع", variant: "destructive" },
                payment: { text: "سند صرف", variant: "outline" }, receipt: { text: "سند قبض", variant: "secondary" },
              };
              const b = badges[r.tab];
              return (<TableRow key={`${r.tab}-${r.id}-${i}`}>
                <TableCell className="text-muted-foreground">{page * PAGE_SIZE + i + 1}</TableCell>
                <TableCell><Badge variant={b.variant} className="text-xs">{b.text}</Badge></TableCell>
                {entityType !== "other" && <TableCell className="font-medium">{r.client_name || "-"}</TableCell>}
                {entityType !== "other" && <TableCell className="font-mono">{r.car_number || "-"}</TableCell>}
                {entityType !== "other" && <TableCell><div className="flex flex-wrap gap-1">{r.types.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}</div></TableCell>}
                <TableCell className={cn("font-bold", r.tab === "refund" ? "text-destructive" : r.tab === "receipt" ? "text-green-600" : "")}>{r.tab === "refund" ? "-" : ""}{fmtCur(r.amount)}</TableCell>
                <TableCell className="font-mono">{fmt(r.date)}</TableCell>
                <TableCell className="text-sm">{r.company_name || "-"}</TableCell>
                {entityType === "broker" && <TableCell className="text-sm">{r.extra || "-"}</TableCell>}
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{r.description || "-"}</TableCell>
              </TableRow>);
            })}</TableBody></Table></div>
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">إجمالي: {filtered.length}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ChevronRight className="h-4 w-4" /></Button>
                <span className="text-sm">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          </>)}
        </Card>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>إضافة حركة يدوية</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAddType("income")}
              className={cn("rounded-lg border-2 p-3 text-center text-sm transition-all", addType === "income" ? "border-green-500 bg-green-50" : "border-border")}>
              <ArrowDownLeft className={cn("h-5 w-5 mx-auto mb-1", addType === "income" ? "text-green-600" : "text-muted-foreground")} />
              دخل
            </button>
            <button onClick={() => setAddType("expense")}
              className={cn("rounded-lg border-2 p-3 text-center text-sm transition-all", addType === "expense" ? "border-red-500 bg-red-50" : "border-border")}>
              <ArrowUpRight className={cn("h-5 w-5 mx-auto mb-1", addType === "expense" ? "text-destructive" : "text-muted-foreground")} />
              مصروف
            </button>
          </div>
          <div className="space-y-1"><Label>البيان *</Label><Input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="وصف الحركة..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>المبلغ *</Label><Input type="number" min="0" step="0.01" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="0" /></div>
            <div className="space-y-1"><Label>التاريخ *</Label><ArabicDatePicker value={addDate} onChange={d => setAddDate(d)} compact /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button><Button onClick={handleSave} disabled={saving}>{saving ? "جاري الحفظ..." : "إضافة"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </MainLayout>
  );
}
