import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen, FileText, RotateCcw, PlusCircle, MoreVertical,
  Download, TrendingUp, TrendingDown, Landmark, Trash2, Pencil, XCircle,
  ChevronLeft, ChevronRight, ChevronDown, Building2, Users, UserPlus,
  ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { ArabicMonthPicker } from "@/components/ui/arabic-month-picker";
import { ExpensePaymentLines, PaymentLine } from "@/components/expenses/ExpensePaymentLines";
import { buildExpenseInvoiceHtml, openExpenseInvoicePrint } from "@/lib/expenseInvoiceBuilder";
import { buildAccountingStatementHtml, openAccountingStatementPrint, type StatementRow } from "@/lib/accountingStatementBuilder";
import abLogo from "@/assets/ab-insurance-logo.png";
import { InlineEditCell } from "@/components/accounting/InlineEditCell";
import { AuditDialog, type AuditResult, type AuditDbRow, computeDiff } from "@/components/accounting/AuditDialog";
import { Sparkles } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { format } from "date-fns";
import { he } from "date-fns/locale";

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
type TabType = "all" | "issuances" | "refunds" | "payment" | "sale" | "receipt";

interface Row {
  id: string;
  tab: "issuance" | "refund" | "payment" | "sale" | "receipt";
  source: "policy" | "settlement" | "expense" | "cheque" | "wallet" | "ledger" | "broker_settlement";
  policyIds?: string[];
  client_name: string;
  car_number: string | null;
  types: string[];
  amount: number;
  date: string;
  issue_date: string;
  description: string;
  company_name: string;
  payment_method: string;
  cheque_number?: string | null;
  extra: string;
  is_split?: boolean;
  // Issuance-only fields (aggregated when grouped)
  payed_for_company?: number;
  profit?: number;
  car_value?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface PolicyDetail {
  id: string;
  client_name: string;
  car_number: string | null;
  type_label: string;
  company_name: string;
  broker_name: string;
  insurance_price: number;
  payed_for_company: number;
  profit: number;
  issue_date: string;
}

const payMethodLabel: Record<string, string> = {
  cash: "نقدي", cheque: "شيك", bank_transfer: "تحويل بنكي",
  visa: "فيزا", customer_cheque: "شيك عميل",
};

interface ExpandedExpenseEntry {
  amount: number;
  expense_date: string;
  payment_method: Exclude<PaymentLine["payment_type"], "customer_cheque">;
  reference_number: string | null;
  cheque_image_url: string | null;
  customer_cheque_ids: string[] | null;
}

interface ExpenseChequeDetail {
  id: string;
  amount: number;
  payment_date: string;
  cheque_number: string | null;
  client_name: string;
  car_number: string | null;
}

interface ExpenseRowLike {
  id: string;
  amount: number | null;
  expense_date: string;
  created_at: string | null;
  description: string | null;
  payment_method: string | null;
  reference_number: string | null;
  customer_cheque_ids?: string[] | null;
}

async function fetchExpenseChequeDetails(expenses: ExpenseRowLike[]) {
  const chequeIds = [...new Set(
    expenses.flatMap((expense) =>
      Array.isArray(expense.customer_cheque_ids)
        ? expense.customer_cheque_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
        : []
    )
  )];

  if (chequeIds.length === 0) return new Map<string, ExpenseChequeDetail>();

  const { data, error } = await supabase
    .from("policy_payments")
    .select("id, amount, payment_date, cheque_number, policies(clients(full_name), cars(car_number))")
    .in("id", chequeIds);

  if (error) throw error;

  return new Map<string, ExpenseChequeDetail>(
    (data || []).map((cheque: any) => [
      cheque.id,
      {
        id: cheque.id,
        amount: Number(cheque.amount) || 0,
        payment_date: cheque.payment_date,
        cheque_number: cheque.cheque_number || null,
        client_name: cheque.policies?.clients?.full_name || "-",
        car_number: cheque.policies?.cars?.car_number || null,
      },
    ])
  );
}

function buildExpenseLedgerRows({
  expense,
  tab,
  description,
  company_name,
  payment_method,
  extra,
  chequeDetailsMap,
}: {
  expense: ExpenseRowLike;
  tab: Row["tab"];
  description: string;
  company_name: string;
  payment_method: string;
  extra: string;
  chequeDetailsMap: Map<string, ExpenseChequeDetail>;
}): Row[] {
  const issueDate = expense.created_at || expense.expense_date;
  const chequeIds = Array.isArray(expense.customer_cheque_ids) ? expense.customer_cheque_ids : [];
  const chequeDetails = chequeIds
    .map((id) => chequeDetailsMap.get(id))
    .filter((detail): detail is ExpenseChequeDetail => Boolean(detail));

  if (chequeDetails.length === 0) {
    return [{
      id: expense.id,
      tab,
      source: "expense",
      client_name: "",
      car_number: null,
      types: [],
      amount: expense.amount || 0,
      date: expense.expense_date,
      issue_date: issueDate,
      description,
      company_name,
      payment_method,
      cheque_number: expense.payment_method === "cheque" ? expense.reference_number || null : null,
      extra,
    }];
  }

  if (chequeDetails.length === 1) {
    const [detail] = chequeDetails;
    return [{
      id: expense.id,
      tab,
      source: "expense",
      client_name: detail.client_name,
      car_number: detail.car_number,
      types: [],
      amount: detail.amount || expense.amount || 0,
      date: detail.payment_date || expense.expense_date,
      issue_date: issueDate,
      description,
      company_name,
      payment_method,
      cheque_number: detail.cheque_number || expense.reference_number || null,
      extra,
    }];
  }

  return chequeDetails.map((detail) => ({
    id: `${expense.id}:${detail.id}`,
    tab,
    source: "expense",
    client_name: detail.client_name,
    car_number: detail.car_number,
    types: [],
    amount: detail.amount,
    date: detail.payment_date || expense.expense_date,
    issue_date: issueDate,
    description,
    company_name,
    payment_method,
    cheque_number: detail.cheque_number,
    extra,
    is_split: true,
  }));
}

function expandPaymentLineEntries(payment: PaymentLine): ExpandedExpenseEntry[] {
  if (payment.payment_type === "customer_cheque" && payment.selected_cheques && payment.selected_cheques.length > 0) {
    return payment.selected_cheques.map((cheque) => ({
      amount: cheque.amount,
      expense_date: payment.payment_date,
      payment_method: "cheque",
      reference_number: cheque.cheque_number || null,
      cheque_image_url: cheque.cheque_image_url || null,
      customer_cheque_ids: cheque.source_type === "outside" ? null : [cheque.id],
    }));
  }

  return [{
    amount: payment.amount,
    expense_date: payment.payment_date,
    payment_method: payment.payment_type === "customer_cheque" ? "cheque" : payment.payment_type,
    reference_number: payment.payment_type === "cheque" ? payment.cheque_number || null : payment.bank_reference || null,
    cheque_image_url: payment.cheque_image_url || null,
    customer_cheque_ids: null,
  }];
}

// ─── Component ───────────────────────────────────────────

export default function Accounting() {
  const { user } = useAuth();
  const { data: siteSettings } = useSiteSettings();
  const def = getDefaultRange();

  // Filters
  const [entityType, setEntityType] = useState<EntityType>("company");
  const [companies, setCompanies] = useState<{ id: string; name: string; name_ar: string | null }[]>([]);
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [selectedBrokerId, setSelectedBrokerId] = useState("all");
  const [otherName, setOtherName] = useState("");
  const [savedContacts, setSavedContacts] = useState<string[]>([]);
  const [selectedPolicyTypes, setSelectedPolicyTypes] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<"month" | "range">("month");
  const [fromDate, setFromDate] = useState(def.from);
  const [toDate, setToDate] = useState(def.to);
  const [selectedMonth, setSelectedMonth] = useState(def.from.slice(0, 7));
  const [activeTab, setActiveTab] = useState<TabType>("all");

  // Data
  const [rows, setRows] = useState<Row[]>([]);
  const [policyDetails, setPolicyDetails] = useState<PolicyDetail[]>([]);
  const [manualExpensesTotal, setManualExpensesTotal] = useState(0);
  const [showPoliciesDetail, setShowPoliciesDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editType, setEditType] = useState<"payment" | "receipt" | "refund" | "sale">("payment");
  const [editPaymentLines, setEditPaymentLines] = useState<PaymentLine[]>([]);
  const [editReceiptImages, setEditReceiptImages] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  // Policy edit fields (for issuance rows)
  const [editPolicies, setEditPolicies] = useState<{ id: string; policy_type_parent: string; policy_type_child: string | null; company_id: string | null; insurance_price: number }[]>([]);
  const [editPoliciesLoading, setEditPoliciesLoading] = useState(false);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addVoucherType, setAddVoucherType] = useState<"payment" | "receipt" | "refund" | "sale">("payment");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [addDesc, setAddDesc] = useState("");
  const [addIssueDate, setAddIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [mainReceiptImages, setMainReceiptImages] = useState<string[]>([]);
  const [mainNotes, setMainNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [addDialogCompanyId, setAddDialogCompanyId] = useState<string>("");
  const [addDialogBrokerId, setAddDialogBrokerId] = useState<string>("");

  // Load reference data
  useEffect(() => {
    supabase.from("insurance_companies").select("id, name, name_ar, category_parent").eq("active", true).order("name_ar").then(({ data }) => {
      const filtered = (data || []).filter(c => {
        const cats = (c as any).category_parent as string[] | null;
        if (!cats || cats.length === 0) return true;
        return cats.some((cat: string) => cat !== "ELZAMI");
      });
      setCompanies(filtered);
    });
    supabase.from("brokers").select("id, name").order("name").then(({ data }) => setBrokers(data || []));
    // Load saved external contacts from previous entries
    supabase.from("expenses").select("contact_name").eq("entity_type", "manual").not("contact_name", "is", null).then(({ data }) => {
      const unique = [...new Set((data || []).map(e => e.contact_name).filter(Boolean))];
      setSavedContacts(unique as string[]);
    });
  }, []);

  // ─── Fetch data ──────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const results: Row[] = [];
    const policyDetailsLocal: PolicyDetail[] = [];

    try {
      if (entityType === "company") {
        // ISSUANCES (includes transferred so policy totals match /reports/company-settlement)
        let q = supabase.from("policies")
          .select("id, insurance_price, payed_for_company, profit, transferred, policy_type_parent, policy_type_child, issue_date, start_date, end_date, created_at, group_id, company_id, clients(full_name), cars(car_number, car_value), insurance_companies(name_ar, name)")
          .gte("issue_date", fromDate).lte("issue_date", toDate)
          .is("deleted_at", null).eq("cancelled", false)
          .neq("policy_type_parent", "ELZAMI");
        if (selectedCompanyIds.length > 0) q = q.in("company_id", selectedCompanyIds);
        if (selectedPolicyTypes.length > 0) {
          // Build OR conditions for mixed parent/child types
          const parents = selectedPolicyTypes.filter(t => t !== "THIRD" && t !== "FULL");
          const children = selectedPolicyTypes.filter(t => t === "THIRD" || t === "FULL");
          if (children.length > 0 && parents.length === 0) {
            q = q.eq("policy_type_parent", "THIRD_FULL").in("policy_type_child", children);
          } else if (parents.length > 0 && children.length === 0) {
            q = q.in("policy_type_parent", parents as any);
          } else {
            // Both: use or filter
            const orParts: string[] = [];
            if (parents.length > 0) orParts.push(`policy_type_parent.in.(${parents.join(",")})`);
            if (children.length > 0) orParts.push(`and(policy_type_parent.eq.THIRD_FULL,policy_type_child.in.(${children.join(",")}))`);
            q = q.or(orParts.join(","));
          }
        }
        const { data: iss } = await q.order("created_at", { ascending: false });

        const gMap = new Map<string, Row>();
        for (const p of iss || []) {
          const isTransferred = Boolean((p as any).transferred);
          const lbl = policyTypeDisplay(p.policy_type_parent, p.policy_type_child);
          const co = (p as any).insurance_companies?.name_ar || (p as any).insurance_companies?.name || "";
          // Transferred policies: include in policy-level totals (match CompanySettlement)
          // but zero out profit and skip from the issuance rows
          policyDetailsLocal.push({
            id: p.id,
            client_name: (p as any).clients?.full_name || "-",
            car_number: (p as any).cars?.car_number || null,
            type_label: lbl,
            company_name: co,
            broker_name: "",
            insurance_price: p.insurance_price || 0,
            payed_for_company: isTransferred ? 0 : (Number((p as any).payed_for_company) || 0),
            profit: isTransferred ? 0 : (Number((p as any).profit) || 0),
            issue_date: (p as any).issue_date || p.created_at,
          });
          const cv = (p as any).cars?.car_value ?? null;
          const sd = (p as any).start_date || null;
          const ed = (p as any).end_date || null;
          const pfc = isTransferred ? 0 : (Number((p as any).payed_for_company) || 0);
          const pr = isTransferred ? 0 : (Number((p as any).profit) || 0);
          if (isTransferred) continue;
          const k = p.group_id || p.id;
          if (gMap.has(k)) {
            const e = gMap.get(k)!;
            e.amount += p.insurance_price || 0;
            e.payed_for_company = (e.payed_for_company || 0) + pfc;
            e.profit = (e.profit || 0) + pr;
            if (cv != null && (e.car_value == null || cv > (e.car_value || 0))) e.car_value = cv;
            if (lbl && !e.types.includes(lbl)) e.types.push(lbl);
            if (e.policyIds && !e.policyIds.includes(p.id)) e.policyIds.push(p.id);
          } else {
            gMap.set(k, { id: k, tab: "issuance", source: "policy", policyIds: [p.id], client_name: (p as any).clients?.full_name || "-", car_number: (p as any).cars?.car_number || null, types: lbl ? [lbl] : [], amount: p.insurance_price || 0, date: (p as any).issue_date || p.created_at, issue_date: (p as any).issue_date || p.created_at, description: "", company_name: co, payment_method: "", extra: "", payed_for_company: pfc, profit: pr, car_value: cv, start_date: sd, end_date: ed });
          }
        }
        results.push(...gMap.values());

        // REFUNDS: cancelled
        let rq = supabase.from("policies")
          .select("id, insurance_price, cancellation_date, issue_date, created_at, clients(full_name), cars(car_number), insurance_companies(name_ar, name)")
          .eq("cancelled", true).neq("policy_type_parent", "ELZAMI").is("deleted_at", null)
          .gte("issue_date", fromDate).lte("issue_date", toDate);
        if (selectedCompanyIds.length > 0) rq = rq.in("company_id", selectedCompanyIds);
        const { data: refs } = await rq;
        for (const p of refs || []) {
          results.push({ id: p.id, tab: "refund", source: "policy", client_name: (p as any).clients?.full_name || "-", car_number: (p as any).cars?.car_number || null, types: [], amount: p.insurance_price || 0, date: p.cancellation_date || p.created_at, issue_date: p.created_at, description: "إلغاء بوليصة", company_name: (p as any).insurance_companies?.name_ar || (p as any).insurance_companies?.name || "", payment_method: "", extra: "" });
        }

        // REFUNDS: returned cheques
        const { data: chqs } = await supabase.from("policy_payments")
          .select("id, amount, payment_date, cheque_number, policies(company_id, clients(full_name), cars(car_number), insurance_companies(name_ar, name))")
          .eq("refused", true).eq("payment_type", "cheque")
          .gte("payment_date", fromDate).lte("payment_date", toDate);
        for (const c of chqs || []) {
          const pol = (c as any).policies;
          if (selectedCompanyIds.length > 0 && !selectedCompanyIds.includes(pol?.company_id)) continue;
          results.push({ id: c.id, tab: "refund", source: "cheque", client_name: pol?.clients?.full_name || "-", car_number: pol?.cars?.car_number || null, types: [], amount: c.amount || 0, date: c.payment_date, issue_date: c.payment_date, description: `شيك مرتجع${c.cheque_number ? ` #${c.cheque_number}` : ""}`, company_name: pol?.insurance_companies?.name_ar || pol?.insurance_companies?.name || "", payment_method: "شيك", cheque_number: c.cheque_number || null, extra: "" });
        }

        // REFUNDS: customer wallet (negative = money owed)
        const { data: wallets } = await supabase.from("customer_wallet_transactions")
          .select("id, amount, created_at, description, clients(full_name)")
          .lt("amount", 0).gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        for (const w of wallets || []) {
          results.push({ id: w.id, tab: "refund", source: "wallet", client_name: (w as any).clients?.full_name || "-", car_number: null, types: [], amount: Math.abs(w.amount), date: w.created_at, issue_date: w.created_at, description: w.description || "رصيد مستحق للعميل", company_name: "", payment_method: "", extra: "" });
        }

        // REFUNDS: manual refund entries (from expenses with voucher_type=refund)
        let rfq = supabase.from("expenses")
          .select("id, amount, expense_date, created_at, description, payment_method, reference_number, entity_id, customer_cheque_ids")
          .eq("voucher_type", "refund").eq("entity_type", "company")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (selectedCompanyIds.length > 0) rfq = rfq.in("entity_id", selectedCompanyIds);
        const { data: manualRefunds } = await rfq;
        const companyRefundChequeMap = await fetchExpenseChequeDetails((manualRefunds || []) as ExpenseRowLike[]);
        for (const e of manualRefunds || []) {
          const co = companies.find(c => c.id === (e as any).entity_id);
          results.push(...buildExpenseLedgerRows({
            expense: e as ExpenseRowLike,
            tab: "refund",
            description: e.description || "مرتجع",
            company_name: co?.name_ar || co?.name || "",
            payment_method: payMethodLabel[(e as any).payment_method] || "",
            extra: e.reference_number ? `#${e.reference_number}` : "",
            chequeDetailsMap: companyRefundChequeMap,
          }));
        }

        // PAYMENTS + RECEIPTS: expenses for company (payment, receipt)
        let pq = supabase.from("expenses")
          .select("id, amount, expense_date, created_at, description, reference_number, payment_method, voucher_type, entity_id, customer_cheque_ids")
          .eq("entity_type", "company")
          .in("voucher_type", ["payment", "receipt"])
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (selectedCompanyIds.length > 0) pq = pq.in("entity_id", selectedCompanyIds);
        const { data: pays } = await pq;
        const companyExpenseChequeMap = await fetchExpenseChequeDetails((pays || []) as ExpenseRowLike[]);
        for (const e of pays || []) {
          const isSale = (e.description || "").startsWith("[مبيعات]");
          const isReceipt = (e as any).voucher_type === "receipt";
          const tab = isSale ? "sale" : isReceipt ? "receipt" : "payment";
          const co = companies.find(c => c.id === (e as any).entity_id);
          results.push(...buildExpenseLedgerRows({
            expense: e as ExpenseRowLike,
            tab,
            description: isSale ? (e.description || "").replace("[مبيعات] ", "") : e.description || (isReceipt ? "سند قبض" : "سند صرف"),
            company_name: co?.name_ar || co?.name || "",
            payment_method: isSale ? "" : payMethodLabel[(e as any).payment_method] || "",
            extra: e.reference_number ? `#${e.reference_number}` : "",
            chequeDetailsMap: companyExpenseChequeMap,
          }));
        }

        // PAYMENTS: company settlements (from company wallet page)
        // Filter by created_at (issue date) not settlement_date (cheque date)
        let csq = supabase.from("company_settlements")
          .select("id, total_amount, settlement_date, created_at, notes, payment_type, cheque_number, status, insurance_companies(name_ar, name)")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (selectedCompanyIds.length > 0) csq = csq.in("company_id", selectedCompanyIds);
        const { data: settlements } = await csq;
        for (const s of settlements || []) {
          if ((s as any).status === "refused") continue;
          const payMethodText = payMethodLabel[s.payment_type || ""] || s.payment_type || "";
          results.push({ id: s.id, tab: "payment", source: "settlement", client_name: "", car_number: null, types: [], amount: s.total_amount || 0, date: s.settlement_date, issue_date: s.created_at, description: s.notes || "تسوية شركة", company_name: (s as any).insurance_companies?.name_ar || (s as any).insurance_companies?.name || "", payment_method: payMethodText, cheque_number: s.cheque_number || null, extra: "" });
        }

        // NOTE: policy_payments (customer payments) are NOT included here.
        // سند القبض = money received FROM insurance company or broker only.
        // Customer payments belong to the issuances flow, not receipts.

      } else if (entityType === "broker") {
        // BROKER ISSUANCES (includes transferred so policy totals match /reports/company-settlement)
        let bq = supabase.from("policies")
          .select("id, insurance_price, payed_for_company, profit, transferred, policy_type_parent, policy_type_child, issue_date, start_date, end_date, created_at, group_id, broker_id, clients(full_name), cars(car_number, car_value), insurance_companies(name_ar, name), brokers(name)")
          .gte("issue_date", fromDate).lte("issue_date", toDate)
          .is("deleted_at", null).eq("cancelled", false)
          .neq("policy_type_parent", "ELZAMI").not("broker_id", "is", null);
        if (selectedBrokerId !== "all") bq = bq.eq("broker_id", selectedBrokerId);
        if (selectedCompanyIds.length > 0) bq = bq.in("company_id", selectedCompanyIds);
        if (selectedPolicyTypes.length > 0) {
          const parents = selectedPolicyTypes.filter(t => t !== "THIRD" && t !== "FULL");
          const children = selectedPolicyTypes.filter(t => t === "THIRD" || t === "FULL");
          if (children.length > 0 && parents.length === 0) {
            bq = bq.eq("policy_type_parent", "THIRD_FULL").in("policy_type_child", children);
          } else if (parents.length > 0 && children.length === 0) {
            bq = bq.in("policy_type_parent", parents as any);
          } else {
            const orParts: string[] = [];
            if (parents.length > 0) orParts.push(`policy_type_parent.in.(${parents.join(",")})`);
            if (children.length > 0) orParts.push(`and(policy_type_parent.eq.THIRD_FULL,policy_type_child.in.(${children.join(",")}))`);
            bq = bq.or(orParts.join(","));
          }
        }
        const { data: bPols } = await bq.order("created_at", { ascending: false });

        const bMap = new Map<string, Row>();
        for (const p of bPols || []) {
          const isTransferred = Boolean((p as any).transferred);
          const lbl = policyTypeDisplay(p.policy_type_parent, p.policy_type_child);
          const co = (p as any).insurance_companies?.name_ar || (p as any).insurance_companies?.name || "";
          const brokerName = (p as any).brokers?.name || "";
          policyDetailsLocal.push({
            id: p.id,
            client_name: (p as any).clients?.full_name || "-",
            car_number: (p as any).cars?.car_number || null,
            type_label: lbl,
            company_name: co,
            broker_name: brokerName,
            insurance_price: p.insurance_price || 0,
            payed_for_company: isTransferred ? 0 : (Number((p as any).payed_for_company) || 0),
            profit: isTransferred ? 0 : (Number((p as any).profit) || 0),
            issue_date: (p as any).issue_date || p.created_at,
          });
          const cv = (p as any).cars?.car_value ?? null;
          const sd = (p as any).start_date || null;
          const ed = (p as any).end_date || null;
          const pfc = isTransferred ? 0 : (Number((p as any).payed_for_company) || 0);
          const pr = isTransferred ? 0 : (Number((p as any).profit) || 0);
          if (isTransferred) continue;
          const k = p.group_id || p.id;
          if (bMap.has(k)) {
            const e = bMap.get(k)!;
            e.amount += p.insurance_price || 0;
            e.payed_for_company = (e.payed_for_company || 0) + pfc;
            e.profit = (e.profit || 0) + pr;
            if (cv != null && (e.car_value == null || cv > (e.car_value || 0))) e.car_value = cv;
            if (lbl && !e.types.includes(lbl)) e.types.push(lbl);
            if (e.policyIds && !e.policyIds.includes(p.id)) e.policyIds.push(p.id);
          } else {
            bMap.set(k, { id: k, tab: "issuance", source: "policy", policyIds: [p.id], client_name: (p as any).clients?.full_name || "-", car_number: (p as any).cars?.car_number || null, types: lbl ? [lbl] : [], amount: p.insurance_price || 0, date: (p as any).issue_date || p.created_at, issue_date: (p as any).issue_date || p.created_at, description: "", company_name: co, payment_method: "", extra: brokerName, payed_for_company: pfc, profit: pr, car_value: cv, start_date: sd, end_date: ed });
          }
        }
        results.push(...bMap.values());

        // BROKER REFUNDS (manual)
        let brfq = supabase.from("expenses")
          .select("id, amount, expense_date, created_at, description, payment_method, reference_number, entity_id, customer_cheque_ids")
          .eq("voucher_type", "refund").eq("entity_type", "broker")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (selectedBrokerId !== "all") brfq = brfq.eq("entity_id", selectedBrokerId);
        const { data: brokerRefunds } = await brfq;
        const brokerRefundChequeMap = await fetchExpenseChequeDetails((brokerRefunds || []) as ExpenseRowLike[]);
        for (const e of brokerRefunds || []) {
          const bName = brokers.find(b => b.id === (e as any).entity_id)?.name || "";
          results.push(...buildExpenseLedgerRows({
            expense: e as ExpenseRowLike,
            tab: "refund",
            description: e.description || "مرتجع",
            company_name: "",
            payment_method: payMethodLabel[(e as any).payment_method] || "",
            extra: bName,
            chequeDetailsMap: brokerRefundChequeMap,
          }));
        }

        // BROKER EXPENSES (payment + receipt)
        let beq = supabase.from("expenses")
          .select("id, amount, expense_date, created_at, description, reference_number, voucher_type, payment_method, entity_id, customer_cheque_ids")
          .eq("entity_type", "broker")
          .in("voucher_type", ["payment", "receipt"])
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (selectedBrokerId !== "all") beq = beq.eq("entity_id", selectedBrokerId);
        const { data: bExps, error: bExpsErr } = await beq;
        if (bExpsErr) console.error("Broker expenses error:", bExpsErr);
        const brokerExpenseChequeMap = await fetchExpenseChequeDetails((bExps || []) as ExpenseRowLike[]);
        for (const e of bExps || []) {
          const isSale = (e.description || "").startsWith("[مبيعات]");
          const isReceipt = e.voucher_type === "receipt";
          const brokerName = brokers.find(b => b.id === e.entity_id)?.name || "";
          const tab = isSale ? "sale" : isReceipt ? "receipt" : "payment";
          results.push(...buildExpenseLedgerRows({
            expense: e as ExpenseRowLike,
            tab,
            description: isSale ? (e.description || "").replace("[مبيعات] ", "") : e.description || (isReceipt ? "سند قبض" : "سند صرف"),
            company_name: "",
            payment_method: isSale ? "" : payMethodLabel[(e as any).payment_method] || "",
            extra: brokerName,
            chequeDetailsMap: brokerExpenseChequeMap,
          }));
        }

        // BROKER SETTLEMENTS (from broker wallet)
        let bsq = supabase.from("broker_settlements")
          .select("id, total_amount, settlement_date, created_at, notes, payment_type, cheque_number, direction, status, brokers(name)")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (selectedBrokerId !== "all") bsq = bsq.eq("broker_id", selectedBrokerId);
        const { data: bSettlements, error: bsError } = await bsq;
        if (bsError) console.error("Broker settlements error:", bsError);
        for (const s of bSettlements || []) {
          if (s.status === "refused") continue; // skip refused
          // broker_owes = broker pays us (money in) → سند قبض
          // we_owe = we pay broker (money out) → سند صرف
          const isReceipt = s.direction === "broker_owes" || s.direction === "from_broker";
          const bPayMethod = payMethodLabel[s.payment_type || ""] || s.payment_type || "";
          results.push({ id: s.id, tab: isReceipt ? "receipt" : "payment", source: "broker_settlement", client_name: "", car_number: null, types: [], amount: s.total_amount || 0, date: s.settlement_date, issue_date: s.created_at, description: s.notes || (isReceipt ? "سند قبض" : "سند صرف"), company_name: "", payment_method: bPayMethod, cheque_number: s.cheque_number || null, extra: (s as any).brokers?.name || "" });
        }

      } else {
        // OTHER: manual entries stored in expenses with entity_type = "manual"
        let oq = supabase.from("expenses")
          .select("id, amount, expense_date, created_at, description, contact_name, voucher_type, payment_method, reference_number, notes, customer_cheque_ids")
          .eq("entity_type", "manual")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        if (otherName) oq = oq.eq("contact_name", otherName);
        const { data: oData } = await oq.order("created_at", { ascending: false });
        const otherExpenseChequeMap = await fetchExpenseChequeDetails((oData || []) as ExpenseRowLike[]);

        for (const e of oData || []) {
          const isSale = (e.description || "").startsWith("[مبيعات]");
          const isReceipt = e.voucher_type === "receipt";
          const tab = isSale ? "sale" as const : isReceipt ? "receipt" as const : "payment" as const;
          results.push(...buildExpenseLedgerRows({
            expense: e as ExpenseRowLike,
            tab,
            description: isSale ? (e.description || "").replace("[مبيعات] ", "") : e.description || (isReceipt ? "سند قبض" : "سند صرف"),
            company_name: e.contact_name || "",
            payment_method: payMethodLabel[e.payment_method || ""] || e.payment_method || "",
            extra: e.reference_number ? `#${e.reference_number}` : "",
            chequeDetailsMap: otherExpenseChequeMap,
          }));
        }

        // Also load legacy ab_ledger manual entries
        const { data: legacyData } = await supabase.from("ab_ledger")
          .select("id, amount, transaction_date, description")
          .eq("reference_type", "manual_adjustment").eq("status", "posted").eq("counterparty_type", "internal")
          .gte("transaction_date", fromDate).lte("transaction_date", toDate)
          .order("transaction_date", { ascending: false });
        for (const tx of legacyData || []) {
          results.push({ id: tx.id, tab: tx.amount >= 0 ? "receipt" : "payment", source: "ledger", client_name: "", car_number: null, types: [], amount: Math.abs(tx.amount), date: tx.transaction_date, issue_date: tx.transaction_date, description: tx.description || (tx.amount >= 0 ? "دخل" : "مصروف"), company_name: "", payment_method: "", extra: "" });
        }
      }

      // Sort all results by date descending (newest first)
      results.sort((a, b) => (b.issue_date || b.date).localeCompare(a.issue_date || a.date));
      setRows(results);
      setPolicyDetails(policyDetailsLocal);

      // Manual operational expenses (for net-profit calculation) — payment vouchers only, excluding sales
      if (entityType !== "other") {
        const { data: manual } = await supabase.from("expenses")
          .select("amount, description")
          .eq("entity_type", "manual")
          .eq("voucher_type", "payment")
          .gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
        const manualTotal = (manual || [])
          .filter(e => !(e.description || "").startsWith("[مبيعات]"))
          .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        setManualExpensesTotal(manualTotal);
      } else {
        setManualExpensesTotal(0);
      }
    } catch (err) {
      console.error("Error:", err);
      toast.error("فشل في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [entityType, selectedCompanyIds, selectedBrokerId, selectedPolicyTypes, fromDate, toDate, otherName, brokers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered + paginated
  const filtered = useMemo(() => {
    if (activeTab === "all") return rows;
    const map: Record<string, string> = { issuances: "issuance", refunds: "refund", payment: "payment", sale: "sale", receipt: "receipt" };
    return rows.filter(r => r.tab === map[activeTab]);
  }, [rows, activeTab]);

  useEffect(() => setPage(0), [activeTab, entityType, selectedCompanyIds, selectedBrokerId, fromDate, toDate]);

  // Group rows by (issue_date day + tab + description + company) so batch
  // entries (e.g. 20 cheques added on same day) collapse into one accordion row
  const groupedRows = useMemo(() => {
    const groupMap = new Map<string, Row[]>();
    const order: string[] = [];
    for (const r of filtered) {
      const day = (r.issue_date || r.date || "").split("T")[0];
      const key = `${day}|${r.tab}|${r.description || ""}|${r.company_name || ""}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        order.push(key);
      }
      groupMap.get(key)!.push(r);
    }
    return order.map(key => ({ key, rows: groupMap.get(key)! }));
  }, [filtered]);

  const totalPages = Math.ceil(groupedRows.length / PAGE_SIZE) || 1;
  const pageGroups = groupedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Summary
  const summary = useMemo(() => {
    const i = rows.filter(r => r.tab === "issuance").reduce((s, r) => s + r.amount, 0);
    const rf = rows.filter(r => r.tab === "refund").reduce((s, r) => s + r.amount, 0);
    const p = rows.filter(r => r.tab === "payment").reduce((s, r) => s + r.amount, 0);
    const sl = rows.filter(r => r.tab === "sale").reduce((s, r) => s + r.amount, 0);
    const rc = rows.filter(r => r.tab === "receipt").reduce((s, r) => s + r.amount, 0);
    const owedToCompany = policyDetails.reduce((s, pol) => s + pol.payed_for_company, 0);
    const policyProfit = policyDetails.reduce((s, pol) => s + pol.profit, 0);
    const remainingToCompany = owedToCompany - p;
    const netProfit = policyProfit - manualExpensesTotal;
    return { issuances: i, refunds: rf, payments: p, sales: sl, receipts: rc, net: i - rf - p - sl + rc, owedToCompany, policyProfit, remainingToCompany, manualExpenses: manualExpensesTotal, netProfit };
  }, [rows, policyDetails, manualExpensesTotal]);

  const showReceipt = true; // All entity types support payment + receipt

  // Export as Arabic account statement (كشف حساب مختصر)
  const handleExportInvoice = () => {
    const data = filtered.length > 0 ? filtered : rows;
    if (data.length === 0) { toast.error("لا توجد بيانات للتصدير"); return; }

    // Movement labels per tab
    const movementLabels: Record<string, string> = {
      issuance: "إصدار",
      refund: "مرتجعات",
      payment: "سند صرف",
      sale: "مبيعات",
      receipt: "سند قبض",
    };

    // Build a rich "البيان" line per row using all available context.
    const statementRows: StatementRow[] = data.map((r) => {
      const isCredit = r.tab === "receipt";
      const parts: string[] = [];
      const party = r.client_name || r.company_name || r.extra;
      if (party) parts.push(party);
      if (r.car_number) parts.push(`سيارة رقم(${r.car_number})`);
      if (r.types && r.types.length > 0) parts.push(r.types.join(" + "));
      if (r.company_name && r.client_name) parts.push(`شركة: ${r.company_name}`);
      if (r.cheque_number) parts.push(`شيك #${r.cheque_number}`);
      else if (r.payment_method) parts.push(r.payment_method);
      if (r.description) parts.push(r.description);
      const description = parts.filter(Boolean).join(" — ") || "-";

      return {
        date: r.date,
        movement: movementLabels[r.tab] || r.tab,
        description,
        debit: isCredit ? 0 : r.amount,
        credit: isCredit ? r.amount : 0,
      };
    });

    const businessName = siteSettings?.site_title || "بشير أبو سنينة";
    const rawLogo = siteSettings?.logo_url || abLogo;
    const logoUrl = rawLogo?.startsWith("http")
      ? rawLogo
      : `${window.location.origin}${rawLogo}`;

    const html = buildAccountingStatementHtml({
      rows: statementRows,
      fromDate,
      toDate,
      customerName: businessName,
      title: "كشف حساب - مختصر",
      logoUrl,
      businessName,
    });
    openAccountingStatementPrint(html);
  };

  // Delete settlement
  const handleDelete = async (row: Row) => {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    try {
      if (row.source === "settlement") {
        await supabase.from("company_settlements").delete().eq("id", row.id);
      } else if (row.source === "broker_settlement") {
        await supabase.from("broker_settlements").delete().eq("id", row.id);
      } else if (row.source === "expense") {
        await supabase.from("expenses").delete().eq("id", row.id);
      } else if (row.source === "ledger") {
        await supabase.from("ab_ledger").delete().eq("id", row.id);
      }
      toast.success("تم الحذف");
      fetchData();
    } catch { toast.error("فشل في الحذف"); }
  };

  // Mark cheque as refused
  const handleRefuseCheque = async (row: Row) => {
    if (row.source !== "settlement" && row.source !== "broker_settlement") return;
    try {
      const table = row.source === "settlement" ? "company_settlements" : "broker_settlements";
      await supabase.from(table).update({ status: "refused" } as any).eq("id", row.id);
      toast.success("تم تسجيل الشيك كمرفوض");
      fetchData();
    } catch { toast.error("فشل في تحديث الحالة"); }
  };

  // Inline-edit saver for issuance rows.
  // Updates one or more policies (and optionally their car) and recomputes profit.
  const saveIssuanceInline = useCallback(async (
    row: Row,
    field: "issue_date" | "start_date" | "end_date" | "insurance_price" | "payed_for_company" | "car_value",
    value: string | number | null,
  ) => {
    const policyIds = row.policyIds && row.policyIds.length > 0 ? row.policyIds : [row.id];
    if (!policyIds.length) return;
    try {
      if (field === "car_value") {
        // Find car_id from any policy in the group
        const { data: pol } = await supabase
          .from("policies")
          .select("car_id")
          .eq("id", policyIds[0])
          .maybeSingle();
        if (!pol?.car_id) { toast.error("لم يتم العثور على السيارة"); return; }
        const { error } = await supabase
          .from("cars")
          .update({ car_value: value as number | null } as any)
          .eq("id", pol.car_id);
        if (error) throw error;
      } else if (field === "insurance_price" || field === "payed_for_company") {
        // Update each policy and recompute profit = insurance_price - payed_for_company
        const { data: pols } = await supabase
          .from("policies")
          .select("id, insurance_price, payed_for_company, transferred")
          .in("id", policyIds);
        for (const p of (pols || []) as any[]) {
          const newPrice = field === "insurance_price" ? Number(value) || 0 : Number(p.insurance_price) || 0;
          const newPfc = field === "payed_for_company" ? Number(value) || 0 : Number(p.payed_for_company) || 0;
          const profit = p.transferred ? 0 : Math.max(0, newPrice - newPfc);
          const patch: any = { profit };
          patch[field] = Number(value) || 0;
          const { error } = await supabase.from("policies").update(patch).eq("id", p.id);
          if (error) throw error;
        }
      } else {
        // Date fields broadcast to all policies in the group
        const patch: any = {};
        patch[field] = value;
        const { error } = await supabase.from("policies").update(patch).in("id", policyIds);
        if (error) throw error;
      }
      toast.success("تم الحفظ");
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "فشل الحفظ");
    }
  }, [fetchData]);

  const openEdit = async (row: Row) => {
    setEditRow(row);
    setEditAmount(String(row.amount));
    setEditDate((row.source === "policy" ? row.issue_date : row.date)?.split("T")[0] || "");
    setEditDesc(row.description);
    setEditType(row.tab === "issuance" ? "payment" : row.tab as any);
    setEditPaymentLines([]);
    setEditReceiptImages([]);
    setEditNotes("");
    setEditPolicies([]);
    setEditOpen(true);

    // Load existing payment data for expense rows (sales have no payment line)
    if (row.source === "expense" && row.tab !== "sale") {
      const expenseId = row.id.split(":")[0];
      const { data: expense } = await supabase
        .from("expenses")
        .select("id, amount, expense_date, description, payment_method, reference_number, notes")
        .eq("id", expenseId)
        .maybeSingle();
      if (expense) {
        const rawDesc = (expense as any).description || "";
        setEditDesc(rawDesc.startsWith("[مبيعات] ") ? rawDesc.replace("[مبيعات] ", "") : rawDesc);
        setEditNotes((expense as any).notes || "");
        const pm = (expense as any).payment_method as string | null;
        const validType: PaymentLine["payment_type"] =
          pm === "cash" || pm === "cheque" || pm === "bank_transfer" || pm === "visa" ? pm : "cash";
        const ref = (expense as any).reference_number || "";
        setEditPaymentLines([{
          id: crypto.randomUUID(),
          payment_type: validType,
          amount: Number((expense as any).amount) || 0,
          payment_date: (expense as any).expense_date || new Date().toISOString().split("T")[0],
          cheque_number: validType === "cheque" ? ref : undefined,
          bank_reference: validType === "bank_transfer" ? ref : undefined,
        }]);
      }
    }

    // Load individual policies for issuance rows
    if (row.source === "policy" && row.policyIds && row.policyIds.length > 0) {
      setEditPoliciesLoading(true);
      const { data } = await supabase
        .from("policies")
        .select("id, policy_type_parent, policy_type_child, company_id, insurance_price")
        .in("id", row.policyIds);
      setEditPolicies((data || []).map((p: any) => ({
        id: p.id,
        policy_type_parent: p.policy_type_parent,
        policy_type_child: p.policy_type_child,
        company_id: p.company_id,
        insurance_price: p.insurance_price || 0,
      })));
      setEditPoliciesLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editRow) return;
    setEditSaving(true);
    try {
      // Policy edits (issuance rows)
      if (editRow.source === "policy" && editPolicies.length > 0) {
        for (const pol of editPolicies) {
          await supabase.from("policies").update({
            policy_type_parent: pol.policy_type_parent,
            policy_type_child: pol.policy_type_child,
            company_id: pol.company_id,
            insurance_price: pol.insurance_price,
            ...(editDate ? { issue_date: editDate } : {}),
          } as any).eq("id", pol.id);
        }
        toast.success("تم تعديل الوثائق بنجاح");
        setEditOpen(false); setEditRow(null);
        fetchData();
        setEditSaving(false);
        return;
      }

      if (editRow.source === "expense") {
        // Determine new voucher_type and description based on editType
        const isSale = editType === "sale";
        const voucherType = editType === "receipt" ? "receipt" : editType === "refund" ? "refund" : "payment";
        const desc = isSale ? `[مبيعات] ${editDesc}` : editDesc;
        const expenseId = editRow.id.split(":")[0];

        if (isSale || editPaymentLines.length === 0) {
          // Simple update (sale or just editing existing)
          const amt = parseFloat(editAmount);
          if (!amt || amt <= 0) { toast.error("يرجى إدخال مبلغ صحيح"); setEditSaving(false); return; }
          await supabase.from("expenses").update({
            amount: amt, expense_date: editDate, description: desc || null,
            voucher_type: voucherType,
            payment_method: isSale ? "cash" : undefined,
            notes: isSale ? "مبيعات - بدون طريقة دفع" : editNotes || undefined,
          } as any).eq("id", expenseId);
        } else {
          // Has payment lines: update the first entry and create new ones
          const firstPayment = editPaymentLines[0];
          const firstAmt = firstPayment.payment_type === "customer_cheque" && firstPayment.selected_cheques
            ? firstPayment.selected_cheques.reduce((s, c) => s + c.amount, 0) : firstPayment.amount;
          const pm = firstPayment.payment_type === "customer_cheque" ? "cheque" : firstPayment.payment_type;
          await supabase.from("expenses").update({
            amount: firstAmt, expense_date: firstPayment.payment_date, description: desc || null,
            voucher_type: voucherType, payment_method: pm,
            reference_number: firstPayment.payment_type === "cheque" ? firstPayment.cheque_number : firstPayment.bank_reference || null,
            notes: editNotes || null,
          } as any).eq("id", expenseId);

          // Create additional lines
          for (let i = 1; i < editPaymentLines.length; i++) {
            const payment = editPaymentLines[i];
            const amount = payment.payment_type === "customer_cheque" && payment.selected_cheques
              ? payment.selected_cheques.reduce((s, c) => s + c.amount, 0) : payment.amount;
            await supabase.from("expenses").insert({
              amount, expense_date: payment.payment_date, description: desc || null,
              voucher_type: voucherType, category: (editRow as any).category || "other",
              entity_type: entityType === "company" ? "company" : entityType === "broker" ? "broker" : "manual",
              entity_id: entityType === "company" ? (selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null) : entityType === "broker" ? (selectedBrokerId !== "all" ? selectedBrokerId : null) : null,
              payment_method: payment.payment_type === "customer_cheque" ? "cheque" : payment.payment_type,
              reference_number: payment.payment_type === "cheque" ? payment.cheque_number : payment.bank_reference || null,
              notes: editNotes || null, created_by_admin_id: user?.id,
            } as any);
          }
        }
      } else if (editRow.source === "settlement") {
        const amt = parseFloat(editAmount);
        if (!amt || amt <= 0) { toast.error("يرجى إدخال مبلغ صحيح"); setEditSaving(false); return; }
        await supabase.from("company_settlements").update({
          total_amount: amt, settlement_date: editDate, notes: editDesc || null,
        } as any).eq("id", editRow.id);
      } else if (editRow.source === "broker_settlement") {
        const amt = parseFloat(editAmount);
        if (!amt || amt <= 0) { toast.error("يرجى إدخال مبلغ صحيح"); setEditSaving(false); return; }
        await supabase.from("broker_settlements").update({
          total_amount: amt, settlement_date: editDate, notes: editDesc || null,
        } as any).eq("id", editRow.id);
      } else if (editRow.source === "ledger") {
        const amt = parseFloat(editAmount);
        if (!amt || amt <= 0) { toast.error("يرجى إدخال مبلغ صحيح"); setEditSaving(false); return; }
        await supabase.from("ab_ledger").update({
          amount: editRow.tab === "payment" ? -amt : amt, transaction_date: editDate, description: editDesc || null,
        } as any).eq("id", editRow.id);
      }
      toast.success("تم التعديل بنجاح");
      setEditOpen(false); setEditRow(null);
      fetchData();
    } catch { toast.error("فشل في التعديل"); }
    finally { setEditSaving(false); }
  };

  const resetAddDialog = () => {
    setAddDesc(""); setMainNotes(""); setMainReceiptImages([]);
    setPaymentLines([]); setSaleAmount(""); setSaleDate(new Date().toISOString().split("T")[0]);
    setAddIssueDate(new Date().toISOString().split("T")[0]);
    setAddDialogCompanyId(selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : "");
    setAddDialogBrokerId(selectedBrokerId !== "all" ? selectedBrokerId : "");
  };

  // Resolve company ID for the add dialog
  const resolvedCompanyId = addDialogCompanyId || (selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : "");
  const resolvedBrokerId = addDialogBrokerId || (selectedBrokerId !== "all" ? selectedBrokerId : "");

  const handleSave = async () => {
    setSaving(true);
    try {
      // SALE: simple entry without payment method
      if (addVoucherType === "sale") {
        const amt = parseFloat(saleAmount);
        if (!amt || amt <= 0) { toast.error("يرجى إدخال مبلغ صحيح"); setSaving(false); return; }
        if (!addDesc.trim()) { toast.error("يرجى إدخال الوصف"); setSaving(false); return; }
        const eType = entityType === "company" ? "company" : entityType === "broker" ? "broker" : "manual";
        const eId = entityType === "company" ? resolvedCompanyId || null
          : entityType === "broker" ? resolvedBrokerId || null : null;
        if ((entityType === "company" || entityType === "broker") && !eId) {
          toast.error("يرجى اختيار جهة واحدة"); setSaving(false); return;
        }
        const { error: insertErr } = await supabase.from("expenses").insert({
          amount: amt,
          expense_date: saleDate,
          description: `[مبيعات] ${addDesc.trim()}`,
          voucher_type: "payment",
          category: entityType === "company" ? "insurance_company" : entityType === "broker" ? "broker_payment" : "other",
          entity_type: eType,
          entity_id: eId,
          contact_name: entityType === "other" ? otherName.trim() || null : null,
          payment_method: "cash",
          notes: mainNotes || "مبيعات - بدون طريقة دفع",
          created_by_admin_id: user?.id,
        } as any);
        if (insertErr) { console.error("Sale insert error:", insertErr); throw insertErr; }
        toast.success("تم إضافة المبيعات بنجاح");
        setAddOpen(false); resetAddDialog();
        fetchData();
        setSaving(false);
        return;
      }

      if (entityType === "other") {
        // Save to expenses with entity_type = "manual"
        if (paymentLines.length === 0) { toast.error("يرجى إضافة دفعة واحدة على الأقل"); setSaving(false); return; }
        if (!otherName.trim()) { toast.error("يرجى إدخال اسم الجهة"); setSaving(false); return; }
        for (const payment of paymentLines) {
          const expandedEntries = expandPaymentLineEntries(payment);
          for (const entry of expandedEntries) {
            await supabase.from("expenses").insert({
              amount: entry.amount,
              expense_date: entry.expense_date,
              description: addDesc.trim() || null,
              voucher_type: addVoucherType,
              category: "other",
              entity_type: "manual",
              entity_id: null,
              contact_name: otherName.trim(),
              payment_method: entry.payment_method,
              reference_number: entry.reference_number,
              notes: mainNotes || null,
              created_by_admin_id: user?.id,
              cheque_image_url: entry.cheque_image_url,
              customer_cheque_ids: entry.customer_cheque_ids,
            } as any);
          }
        }
        // Refresh saved contacts
        if (!savedContacts.includes(otherName.trim())) {
          setSavedContacts(prev => [...prev, otherName.trim()]);
        }
      } else if (entityType === "company") {
        if (paymentLines.length === 0) { toast.error("يرجى إضافة دفعة واحدة على الأقل"); setSaving(false); return; }
        const companyId = resolvedCompanyId || null;
        if (!companyId) { toast.error("يرجى اختيار شركة تأمين واحدة للإضافة"); setSaving(false); return; }

        const companyName = companies.find(c => c.id === companyId)?.name_ar || companies.find(c => c.id === companyId)?.name || "";
        // All company entries save to expenses table
        const voucherType = addVoucherType === "refund" ? "refund" : addVoucherType;
        for (const payment of paymentLines) {
          const customerChequeIds = payment.payment_type === "customer_cheque" && payment.selected_cheques
            ? payment.selected_cheques.map(c => c.id) : [];
          const expandedEntries = expandPaymentLineEntries(payment);
          for (const entry of expandedEntries) {
            const { error: insertErr } = await supabase.from("expenses").insert({
              amount: entry.amount,
              expense_date: entry.expense_date,
              description: addDesc.trim() || null,
              voucher_type: voucherType,
              category: "insurance_company",
              entity_type: "company", entity_id: companyId,
              payment_method: entry.payment_method,
              reference_number: entry.reference_number,
              notes: mainNotes || null,
              created_by_admin_id: user?.id,
              cheque_image_url: entry.cheque_image_url,
              customer_cheque_ids: entry.customer_cheque_ids,
            } as any);
            if (insertErr) { console.error("Company expense insert error:", insertErr); throw insertErr; }
          }
          if (customerChequeIds.length > 0) {
            await supabase.from("policy_payments").update({ refused: false } as any).in("id", customerChequeIds);
          }
        }
      } else if (entityType === "broker") {
        if (paymentLines.length === 0) { toast.error("يرجى إضافة دفعة واحدة على الأقل"); setSaving(false); return; }
        const brokerId = resolvedBrokerId || null;
        if (!brokerId) { toast.error("يرجى اختيار وكيل"); setSaving(false); return; }

        const brokerName = brokers.find(b => b.id === brokerId)?.name || "";
        // All broker entries save to expenses table (same as /expenses page)
        const voucherType = addVoucherType === "refund" ? "refund" : addVoucherType;
        for (const payment of paymentLines) {
          const expandedEntries = expandPaymentLineEntries(payment);
          for (const entry of expandedEntries) {
            const { error: insertErr } = await supabase.from("expenses").insert({
              amount: entry.amount,
              expense_date: entry.expense_date,
              description: addDesc.trim() || null,
              voucher_type: voucherType,
              category: "broker_payment",
              entity_type: "broker", entity_id: brokerId,
              payment_method: entry.payment_method,
              reference_number: entry.reference_number,
              notes: mainNotes || null,
              created_by_admin_id: user?.id,
              cheque_image_url: entry.cheque_image_url,
              customer_cheque_ids: entry.customer_cheque_ids,
            } as any);
            if (insertErr) { console.error("Broker expense insert error:", insertErr); throw insertErr; }
          }
        }
      }
      toast.success("تم الإضافة بنجاح");
      setAddOpen(false); resetAddDialog();
      fetchData();
    } catch (err) { console.error(err); toast.error("فشل في الإضافة"); }
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
            <button key={e.t} onClick={() => { setEntityType(e.t); setActiveTab("all"); setPage(0); setSelectedPolicyTypes([]); setSelectedCompanyIds([]); setSelectedBrokerId("all"); }}
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
            {/* Broker selector FIRST when in broker mode */}
            {entityType === "broker" && (
              <div className="space-y-1"><Label className="text-xs">الوكيل</Label>
                <Select value={selectedBrokerId} onValueChange={v => { setSelectedBrokerId(v); setPage(0); }}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="اختر وكيل..." /></SelectTrigger>
                  <SelectContent><SelectItem value="all">كل الوكلاء</SelectItem>{brokers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {/* Company multi-select for both company and broker views */}
            {(entityType === "company" || entityType === "broker") && (
              <div className="space-y-1">
                <Label className="text-xs">شركة التأمين</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[220px] justify-between text-sm font-normal">
                      {selectedCompanyIds.length === 0 ? "كل الشركات" : `${selectedCompanyIds.length} شركة محددة`}
                      <ChevronLeft className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-2 max-h-[300px] overflow-y-auto" align="start">
                    <button onClick={() => { setSelectedCompanyIds([]); setPage(0); }}
                      className={cn("w-full text-right text-sm px-2 py-1.5 rounded hover:bg-muted", selectedCompanyIds.length === 0 && "bg-primary/10 font-medium")}>
                      كل الشركات
                    </button>
                    {companies.map(c => {
                      const selected = selectedCompanyIds.includes(c.id);
                      return (
                        <button key={c.id} onClick={() => {
                          setSelectedCompanyIds(prev => selected ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                          setPage(0);
                        }} className={cn("w-full text-right text-sm px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2", selected && "bg-primary/10 font-medium")}>
                          <div className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0", selected ? "bg-primary border-primary" : "border-muted-foreground/30")}>
                            {selected && <span className="text-white text-xs">✓</span>}
                          </div>
                          {c.name_ar || c.name}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {entityType === "other" && (
              <div className="space-y-1"><Label className="text-xs">اسم الجهة</Label>
                {savedContacts.length > 0 ? (
                  <Select value={otherName || "all"} onValueChange={v => { setOtherName(v === "all" ? "" : v); setPage(0); }}>
                    <SelectTrigger className="w-[200px]"><SelectValue placeholder="اختر جهة..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {savedContacts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="اسم الكراج / الجهة..." className="w-[200px]" />
                )}
              </div>
            )}
            {entityType !== "other" && (
              <div className="space-y-1">
                <Label className="text-xs">نوع البوليصة</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[180px] justify-between text-sm font-normal">
                      {selectedPolicyTypes.length === 0 ? "كل الأنواع" : `${selectedPolicyTypes.length} نوع محدد`}
                      <ChevronLeft className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-2" align="start">
                    <button onClick={() => { setSelectedPolicyTypes([]); setPage(0); }}
                      className={cn("w-full text-right text-sm px-2 py-1.5 rounded hover:bg-muted", selectedPolicyTypes.length === 0 && "bg-primary/10 font-medium")}>
                      كل الأنواع
                    </button>
                    {[
                      { v: "THIRD", l: "ثالث" }, { v: "FULL", l: "شامل" },
                      { v: "ROAD_SERVICE", l: "خدمات الطريق" },
                      { v: "ACCIDENT_FEE_EXEMPTION", l: "إعفاء رسوم حادث" },
                      { v: "HEALTH", l: "تأمين صحي" },
                    ].map(t => {
                      const sel = selectedPolicyTypes.includes(t.v);
                      return (
                        <button key={t.v} onClick={() => {
                          setSelectedPolicyTypes(prev => sel ? prev.filter(x => x !== t.v) : [...prev, t.v]);
                          setPage(0);
                        }} className={cn("w-full text-right text-sm px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2", sel && "bg-primary/10 font-medium")}>
                          <div className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0", sel ? "bg-primary border-primary" : "border-muted-foreground/30")}>
                            {sel && <span className="text-white text-xs">✓</span>}
                          </div>
                          {t.l}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
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
                <ArabicMonthPicker
                  value={selectedMonth}
                  onChange={val => {
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

            <Button variant="outline" className="gap-2" onClick={handleExportInvoice}><Download className="h-4 w-4" />تصدير קבלה</Button>
          </div>
        </Card>

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            { l: "إجمالي الإصدارات", v: summary.issuances, c: "text-primary", bg: "bg-primary/10", I: TrendingUp },
            { l: "إجمالي المرتجعات", v: summary.refunds, c: "text-destructive", bg: "bg-destructive/10", I: TrendingDown },
            { l: "سندات الصرف", v: summary.payments, c: "text-amber-600", bg: "bg-amber-100", I: ArrowUpRight },
            { l: "مبيعات", v: summary.sales, c: "text-blue-700", bg: "bg-blue-50", I: FileText },
            { l: "سندات القبض", v: summary.receipts, c: "text-blue-600", bg: "bg-blue-100", I: ArrowDownLeft },
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

        {/* Policy-level totals (owed, profit, net) */}
        {entityType !== "other" && (
          <div className={cn("grid gap-4", entityType === "company" ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-3")}>
            {(entityType === "company" ? [
              { l: "المستحق للشركات", v: summary.owedToCompany, c: "text-orange-600", bg: "bg-orange-100", I: Building2 },
              { l: "المدفوع للشركات", v: summary.payments, c: "text-amber-600", bg: "bg-amber-100", I: ArrowUpRight },
              { l: "المتبقي للشركات", v: summary.remainingToCompany, c: summary.remainingToCompany > 0 ? "text-destructive" : "text-green-600", bg: summary.remainingToCompany > 0 ? "bg-destructive/10" : "bg-green-100", I: Landmark },
              { l: "الربح من البوالص", v: summary.policyProfit, c: "text-emerald-600", bg: "bg-emerald-100", I: TrendingUp },
              { l: "الربح الصافي", v: summary.netProfit, c: summary.netProfit >= 0 ? "text-green-700" : "text-destructive", bg: summary.netProfit >= 0 ? "bg-green-100" : "bg-destructive/10", I: Landmark },
            ] : [
              { l: "الربح من البوالص", v: summary.policyProfit, c: "text-emerald-600", bg: "bg-emerald-100", I: TrendingUp },
              { l: "المصاريف التشغيلية", v: summary.manualExpenses, c: "text-destructive", bg: "bg-destructive/10", I: TrendingDown },
              { l: "الربح الصافي", v: summary.netProfit, c: summary.netProfit >= 0 ? "text-green-700" : "text-destructive", bg: summary.netProfit >= 0 ? "bg-green-100" : "bg-destructive/10", I: Landmark },
            ]).map((s, i) => (
              <Card key={i} className="p-4"><div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground">{s.l}</p>
                  {loading ? <Skeleton className="h-7 w-20 mt-1" /> : <p className={cn("text-xl font-bold", s.c)}>{fmtCur(s.v)}</p>}
                </div>
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", s.bg)}><s.I className={cn("h-4 w-4", s.c)} /></div>
              </div></Card>
            ))}
          </div>
        )}

        {/* Collapsible policy-detail table */}
        {entityType !== "other" && policyDetails.length > 0 && (
          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPoliciesDetail(v => !v)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={cn("h-4 w-4 transition-transform", showPoliciesDetail ? "" : "-rotate-90")} />
                <span className="font-medium">تفاصيل البوالص ({policyDetails.length})</span>
              </div>
              <div className="text-xs text-muted-foreground">
                مستحق: {fmtCur(summary.owedToCompany)} · ربح: {fmtCur(summary.policyProfit)}
              </div>
            </button>
            {showPoliciesDetail && (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">رقم السيارة</TableHead>
                    <TableHead className="text-right">نوع التأمين</TableHead>
                    <TableHead className="text-right">الشركة</TableHead>
                    {entityType === "broker" && <TableHead className="text-right">الوكيل</TableHead>}
                    <TableHead className="text-right">تاريخ الإصدار</TableHead>
                    <TableHead className="text-right">سعر التأمين</TableHead>
                    <TableHead className="text-right">المستحق للشركة</TableHead>
                    <TableHead className="text-right">الربح</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {policyDetails.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{p.client_name}</TableCell>
                        <TableCell>{p.car_number || "-"}</TableCell>
                        <TableCell>{p.type_label || "-"}</TableCell>
                        <TableCell>{p.company_name || "-"}</TableCell>
                        {entityType === "broker" && <TableCell>{p.broker_name || "-"}</TableCell>}
                        <TableCell>{fmt(p.issue_date)}</TableCell>
                        <TableCell className="font-mono">{fmtCur(p.insurance_price)}</TableCell>
                        <TableCell className="font-mono text-orange-600">{fmtCur(p.payed_for_company)}</TableCell>
                        <TableCell className="font-mono text-emerald-600">{fmtCur(p.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        )}

        {/* Tabs + Add Button */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground flex-1 grid grid-cols-6">
            {([
              { v: "all" as TabType, l: "الكل", I: null },
              { v: "issuances" as TabType, l: "إصدارات", I: FileText },
              { v: "refunds" as TabType, l: "مرتجعات", I: RotateCcw },
              { v: "payment" as TabType, l: "سند صرف", I: ArrowUpRight },
              { v: "sale" as TabType, l: "مبيعات", I: FileText },
              { v: "receipt" as TabType, l: "سند قبض", I: ArrowDownLeft },
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
            resetAddDialog();
            // Default the voucher type to match the currently active tab so a
            // user viewing "سند قبض" gets a receipt voucher (not صرف) by default.
            const tabToVoucher: Record<string, "payment" | "receipt" | "refund" | "sale"> = {
              receipt: "receipt", payment: "payment", refunds: "refund", sale: "sale",
            };
            setAddVoucherType(tabToVoucher[activeTab] || "payment");
            setAddOpen(true);
          }} className="gap-2 shrink-0"><PlusCircle className="h-4 w-4" />إضافة</Button>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {loading ? <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : pageGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">لا توجد بيانات</div>
          ) : (<>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50">
              <TableHead className="text-right w-10">#</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              {entityType !== "other" && <TableHead className="text-right">العميل</TableHead>}
              {entityType !== "other" && <TableHead className="text-right">رقم السيارة</TableHead>}
              {entityType !== "other" && <TableHead className="text-right">{activeTab === "receipt" || activeTab === "payment" || activeTab === "refunds" ? "رقم الشيك" : activeTab === "all" ? "نوع البوليصة / رقم الشيك" : "نوع البوليصة"}</TableHead>}
              <TableHead className="text-right">{entityType === "broker" ? "الشركة" : "الشركة"}</TableHead>
              {entityType === "broker" && <TableHead className="text-right">الوكيل</TableHead>}
              <TableHead className="text-right">تاريخ الإصدار</TableHead>
              {activeTab === "issuances" && <TableHead className="text-right">تاريخ البداية</TableHead>}
              {activeTab === "issuances" && <TableHead className="text-right">تاريخ النهاية</TableHead>}
              {activeTab === "issuances" && <TableHead className="text-right">قيمة السيارة</TableHead>}
              <TableHead className="text-right">المبلغ</TableHead>
              {activeTab === "issuances" && <TableHead className="text-right">المستحق للشركة</TableHead>}
              {activeTab === "issuances" && <TableHead className="text-right">الربح</TableHead>}
              {activeTab !== "issuances" && <TableHead className="text-right">تاريخ الدفع</TableHead>}
              {activeTab !== "issuances" && <TableHead className="text-right">طريقة الدفع</TableHead>}
              <TableHead className="text-right">البيان</TableHead>
              <TableHead className="text-right w-10">إجراءات</TableHead>
            </TableRow></TableHeader>
            <TableBody>{pageGroups.flatMap((g, gi) => {
              const badges: Record<string, { text: string; variant: "default" | "destructive" | "outline" | "secondary" }> = {
                issuance: { text: "إصدار", variant: "default" }, refund: { text: "مرتجع", variant: "destructive" },
                payment: { text: "سند صرف", variant: "outline" }, sale: { text: "مبيعات", variant: "secondary" },
                receipt: { text: "سند قبض", variant: "secondary" },
              };

              const renderRow = (r: Row, rowNum: string, isChild: boolean = false, key?: string) => {
                const b = badges[r.tab];
                const canAct = !r.is_split && (r.source === "settlement" || r.source === "broker_settlement" || r.source === "expense" || r.source === "ledger" || r.source === "policy");
                const isCheque = r.payment_method.includes("شيك");
                return (
                  <TableRow key={key || `${r.tab}-${r.id}`} className={isChild ? "bg-muted/20" : ""}>
                    <TableCell className="text-muted-foreground">{rowNum}</TableCell>
                    <TableCell><Badge variant={b.variant} className="text-xs">{b.text}</Badge></TableCell>
                    {entityType !== "other" && <TableCell className="font-medium">{r.client_name || "-"}</TableCell>}
                    {entityType !== "other" && <TableCell className="font-mono">{r.car_number || "-"}</TableCell>}
                    {entityType !== "other" && (
                      <TableCell>
                        {r.cheque_number ? (
                          <span className="font-mono text-xs">{r.cheque_number}</span>
                        ) : r.types.length > 0 ? (
                          <div className="flex flex-wrap gap-1">{r.types.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}</div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">{r.company_name || "-"}</TableCell>
                    {entityType === "broker" && <TableCell className="text-sm">{r.extra || "-"}</TableCell>}
                    <TableCell className="font-mono text-xs">
                      {activeTab === "issuances" && r.source === "policy" ? (
                        <InlineEditCell value={r.issue_date} kind="date" display={(v) => fmt(v as string)} onSave={(v) => saveIssuanceInline(r, "issue_date", v)} />
                      ) : fmt(r.issue_date)}
                    </TableCell>
                    {activeTab === "issuances" && (
                      <TableCell className="font-mono text-xs">
                        {r.source === "policy" ? (
                          <InlineEditCell value={r.start_date} kind="date" display={(v) => v ? fmt(v as string) : "-"} onSave={(v) => saveIssuanceInline(r, "start_date", v)} />
                        ) : (r.start_date ? fmt(r.start_date) : "-")}
                      </TableCell>
                    )}
                    {activeTab === "issuances" && (
                      <TableCell className="font-mono text-xs">
                        {r.source === "policy" ? (
                          <InlineEditCell value={r.end_date} kind="date" display={(v) => v ? fmt(v as string) : "-"} onSave={(v) => saveIssuanceInline(r, "end_date", v)} />
                        ) : (r.end_date ? fmt(r.end_date) : "-")}
                      </TableCell>
                    )}
                    {activeTab === "issuances" && (
                      <TableCell className="font-mono text-xs">
                        {r.source === "policy" ? (
                          <InlineEditCell value={r.car_value} kind="number" display={(v) => v != null ? fmtCur(v as number) : "-"} onSave={(v) => saveIssuanceInline(r, "car_value", v)} />
                        ) : (r.car_value != null ? fmtCur(r.car_value) : "-")}
                      </TableCell>
                    )}
                    <TableCell className={cn("font-bold", r.tab === "refund" ? "text-destructive" : r.tab === "receipt" ? "text-green-600" : "")}>
                      {activeTab === "issuances" && r.source === "policy" ? (
                        <InlineEditCell value={r.amount} kind="number" display={(v) => fmtCur(v as number)} onSave={(v) => saveIssuanceInline(r, "insurance_price", v)} />
                      ) : (<>{r.tab === "refund" ? "-" : ""}{fmtCur(r.amount)}</>)}
                    </TableCell>
                    {activeTab === "issuances" && (
                      <TableCell className="font-mono text-xs text-orange-600">
                        {r.source === "policy" ? (
                          <InlineEditCell value={r.payed_for_company} kind="number" display={(v) => v != null ? fmtCur(v as number) : "-"} onSave={(v) => saveIssuanceInline(r, "payed_for_company", v)} />
                        ) : (r.payed_for_company != null ? fmtCur(r.payed_for_company) : "-")}
                      </TableCell>
                    )}
                    {activeTab === "issuances" && <TableCell className="font-mono text-xs text-emerald-600">{r.profit != null ? fmtCur(r.profit) : "-"}</TableCell>}
                    {activeTab !== "issuances" && <TableCell className="font-mono text-xs">{r.date !== r.issue_date ? fmt(r.date) : "-"}</TableCell>}
                    {activeTab !== "issuances" && <TableCell className="text-xs">{r.payment_method || "-"}</TableCell>}
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{r.description || "-"}</TableCell>
                    <TableCell>
                      {canAct && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4 ml-2" />تعديل
                            </DropdownMenuItem>
                            {isCheque && (
                              <DropdownMenuItem onClick={() => handleRefuseCheque(r)} className="text-destructive">
                                <XCircle className="h-4 w-4 ml-2" />شيك مرفوض
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDelete(r)} className="text-destructive">
                              <Trash2 className="h-4 w-4 ml-2" />حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              };

              // Single entry: render normally
              if (g.rows.length === 1) {
                return [renderRow(g.rows[0], String(page * PAGE_SIZE + gi + 1))];
              }

              // Multiple entries: render accordion parent + optional children
              const first = g.rows[0];
              const b = badges[first.tab];
              const totalAmount = g.rows.reduce((s, r) => s + r.amount, 0);
              const isExpanded = expandedGroups.has(g.key);
              const rowNum = String(page * PAGE_SIZE + gi + 1);

              const parent = (
                <TableRow key={`group-${g.key}`} className="bg-primary/5 hover:bg-primary/10 cursor-pointer font-medium" onClick={() => toggleGroup(g.key)}>
                  <TableCell className="text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                      {rowNum}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={b.variant} className="text-xs">{b.text}</Badge>
                      <Badge variant="outline" className="text-xs">{g.rows.length}</Badge>
                    </div>
                  </TableCell>
                  {entityType !== "other" && <TableCell className="font-medium">{first.client_name || "-"}</TableCell>}
                  {entityType !== "other" && <TableCell className="font-mono">{first.car_number || "-"}</TableCell>}
                  {entityType !== "other" && <TableCell className="text-xs text-muted-foreground">{g.rows.length} سند</TableCell>}
                  <TableCell className="text-sm">{first.company_name || "-"}</TableCell>
                  {entityType === "broker" && <TableCell className="text-sm">{first.extra || "-"}</TableCell>}
                  <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                    {activeTab === "issuances" && first.source === "policy" ? (
                      <InlineEditCell value={first.issue_date} kind="date" display={(v) => fmt(v as string)} onSave={(v) => saveIssuanceInline({ ...first, policyIds: g.rows.flatMap(r => r.policyIds || []) }, "issue_date", v)} />
                    ) : fmt(first.issue_date)}
                  </TableCell>
                  {activeTab === "issuances" && (
                    <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                      {first.source === "policy" ? (
                        <InlineEditCell value={first.start_date} kind="date" display={(v) => v ? fmt(v as string) : "-"} onSave={(v) => saveIssuanceInline({ ...first, policyIds: g.rows.flatMap(r => r.policyIds || []) }, "start_date", v)} />
                      ) : (first.start_date ? fmt(first.start_date) : "-")}
                    </TableCell>
                  )}
                  {activeTab === "issuances" && (
                    <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                      {first.source === "policy" ? (
                        <InlineEditCell value={first.end_date} kind="date" display={(v) => v ? fmt(v as string) : "-"} onSave={(v) => saveIssuanceInline({ ...first, policyIds: g.rows.flatMap(r => r.policyIds || []) }, "end_date", v)} />
                      ) : (first.end_date ? fmt(first.end_date) : "-")}
                    </TableCell>
                  )}
                  {activeTab === "issuances" && (
                    <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                      {first.source === "policy" ? (
                        <InlineEditCell value={first.car_value} kind="number" display={(v) => v != null ? fmtCur(v as number) : "-"} onSave={(v) => saveIssuanceInline({ ...first, policyIds: g.rows.flatMap(r => r.policyIds || []) }, "car_value", v)} />
                      ) : (first.car_value != null ? fmtCur(first.car_value) : "-")}
                    </TableCell>
                  )}
                  <TableCell className={cn("font-bold", first.tab === "refund" ? "text-destructive" : first.tab === "receipt" ? "text-green-600" : "")}>
                    {first.tab === "refund" ? "-" : ""}{fmtCur(totalAmount)}
                  </TableCell>
                  {activeTab === "issuances" && <TableCell className="font-mono text-xs text-orange-600">{fmtCur(g.rows.reduce((s, r) => s + (r.payed_for_company || 0), 0))}</TableCell>}
                  {activeTab === "issuances" && <TableCell className="font-mono text-xs text-emerald-600">{fmtCur(g.rows.reduce((s, r) => s + (r.profit || 0), 0))}</TableCell>}
                  {activeTab !== "issuances" && <TableCell className="font-mono text-xs">-</TableCell>}
                  {activeTab !== "issuances" && <TableCell className="text-xs">{first.payment_method || "-"}</TableCell>}
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{first.description || "-"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {first.source === "policy" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit({ ...first, policyIds: g.rows.flatMap(r => r.policyIds || []) })}>
                            <Pencil className="h-4 w-4 ml-2" />تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete({ ...first, policyIds: g.rows.flatMap(r => r.policyIds || []) })} className="text-destructive">
                            <Trash2 className="h-4 w-4 ml-2" />حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );

              if (!isExpanded) return [parent];

              return [
                parent,
                ...g.rows.map((r, ri) => renderRow(r, `${rowNum}.${ri + 1}`, true, `child-${g.key}-${r.id}-${ri}`)),
              ];
            })}</TableBody></Table></div>
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                إجمالي: {filtered.length}
                {groupedRows.length !== filtered.length && ` (${groupedRows.length} مجموعة)`}
              </p>
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
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {entityType === "company" ? "سند جديد - شركة تأمين" : entityType === "broker" ? "سند جديد - وكيل" : "إضافة حركة يدوية"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Voucher type selector */}
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => setAddVoucherType("payment")}
                className={cn("rounded-xl border-2 p-3 text-center transition-all", addVoucherType === "payment" ? "border-red-400 bg-red-50" : "border-border")}>
                <ArrowUpRight className={cn("h-5 w-5 mx-auto mb-1", addVoucherType === "payment" ? "text-red-500" : "text-muted-foreground")} />
                <p className={cn("font-bold text-xs", addVoucherType === "payment" ? "text-red-600" : "")}>سند صرف</p>
                <p className="text-[10px] text-muted-foreground">مبلغ خارج</p>
              </button>
              <button onClick={() => setAddVoucherType("sale")}
                className={cn("rounded-xl border-2 p-3 text-center transition-all", addVoucherType === "sale" ? "border-blue-400 bg-blue-50" : "border-border")}>
                <FileText className={cn("h-5 w-5 mx-auto mb-1", addVoucherType === "sale" ? "text-blue-600" : "text-muted-foreground")} />
                <p className={cn("font-bold text-xs", addVoucherType === "sale" ? "text-blue-700" : "")}>مبيعات</p>
                <p className="text-[10px] text-muted-foreground">بدون طريقة دفع</p>
              </button>
              <button onClick={() => setAddVoucherType("refund")}
                className={cn("rounded-xl border-2 p-3 text-center transition-all", addVoucherType === "refund" ? "border-amber-400 bg-amber-50" : "border-border")}>
                <RotateCcw className={cn("h-5 w-5 mx-auto mb-1", addVoucherType === "refund" ? "text-amber-600" : "text-muted-foreground")} />
                <p className={cn("font-bold text-xs", addVoucherType === "refund" ? "text-amber-700" : "")}>مرتجع</p>
                <p className="text-[10px] text-muted-foreground">إلغاء / إرجاع</p>
              </button>
              <button onClick={() => setAddVoucherType("receipt")}
                className={cn("rounded-xl border-2 p-3 text-center transition-all", addVoucherType === "receipt" ? "border-primary bg-primary/5" : "border-border")}>
                <ArrowDownLeft className={cn("h-5 w-5 mx-auto mb-1", addVoucherType === "receipt" ? "text-primary" : "text-muted-foreground")} />
                <p className={cn("font-bold text-xs", addVoucherType === "receipt" ? "text-primary" : "")}>سند قبض</p>
                <p className="text-[10px] text-muted-foreground">مبلغ داخل</p>
              </button>
            </div>

            {/* Company selector inside dialog when no single company pre-selected */}
            {entityType === "company" && (
              <div className="space-y-1">
                <Label>شركة التأمين *</Label>
                <Select value={resolvedCompanyId} onValueChange={v => setAddDialogCompanyId(v)}>
                  <SelectTrigger><SelectValue placeholder="اختر شركة تأمين..." /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {/* Broker selector inside dialog when no single broker pre-selected */}
            {entityType === "broker" && (
              <div className="space-y-1">
                <Label>الوكيل *</Label>
                <Select value={resolvedBrokerId} onValueChange={v => setAddDialogBrokerId(v)}>
                  <SelectTrigger><SelectValue placeholder="اختر وكيل..." /></SelectTrigger>
                  <SelectContent>{brokers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {/* Contact name for "other" */}
            {entityType === "other" && (
              <div className="space-y-1">
                <Label>اسم الجهة *</Label>
                <Input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="اسم الكراج / الشخص..." />
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <Label>الوصف{addVoucherType === "sale" ? " *" : ""}</Label>
              <Input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="وصف السند..." />
            </div>

            {/* Sale: simple amount + date (no payment lines) */}
            {addVoucherType === "sale" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>المبلغ *</Label>
                  <Input type="number" min="0" step="0.01" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>التاريخ *</Label>
                  <ArabicDatePicker value={saleDate} onChange={d => setSaleDate(d)} compact />
                </div>
              </div>
            ) : (
            /* Payment Lines - same component as expenses page */
            <ExpensePaymentLines
              paymentLines={paymentLines}
              setPaymentLines={setPaymentLines}
              mainReceiptImages={mainReceiptImages}
              setMainReceiptImages={setMainReceiptImages}
              mainNotes={mainNotes}
              setMainNotes={setMainNotes}
              entityId={entityType === "company" ? resolvedCompanyId : entityType === "broker" ? resolvedBrokerId : ""}
              entityType={entityType === "company" ? "company" : "broker"}
            />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? "جاري الحفظ..." : addVoucherType === "sale" ? "حفظ المبيعات" : `حفظ الدفعات (${paymentLines.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={(editRow?.source === "expense" || editRow?.source === "policy") ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-md"}>
          <DialogHeader><DialogTitle>تعديل الحركة</DialogTitle></DialogHeader>
          {editRow && (
            <div className="space-y-4">
              {/* Policy fields (for issuance rows) */}
              {editRow.source === "policy" && (
                editPoliciesLoading ? (
                  <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">الوثائق ({editPolicies.length})</p>
                    {editPolicies.map((pol, idx) => (
                      <div key={pol.id} className="rounded-lg border p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">وثيقة {idx + 1}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">نوع التأمين</Label>
                            <Select
                              value={pol.policy_type_parent === "THIRD_FULL" ? (pol.policy_type_child || "THIRD") : pol.policy_type_parent}
                              onValueChange={v => {
                                setEditPolicies(prev => prev.map((p, i) => i === idx ? {
                                  ...p,
                                  policy_type_parent: (v === "THIRD" || v === "FULL") ? "THIRD_FULL" : v,
                                  policy_type_child: (v === "THIRD" || v === "FULL") ? v : null,
                                } : p));
                              }}
                            >
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="THIRD">ثالث</SelectItem>
                                <SelectItem value="FULL">شامل</SelectItem>
                                <SelectItem value="ROAD_SERVICE">خدمات الطريق</SelectItem>
                                <SelectItem value="ACCIDENT_FEE_EXEMPTION">إعفاء رسوم حادث</SelectItem>
                                <SelectItem value="HEALTH">تأمين صحي</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">الشركة</Label>
                            <Select value={pol.company_id || ""} onValueChange={v => {
                              setEditPolicies(prev => prev.map((p, i) => i === idx ? { ...p, company_id: v } : p));
                            }}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="اختر..." /></SelectTrigger>
                              <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">سعر التأمين</Label>
                            <Input type="number" min="0" step="0.01" className="h-9" value={pol.insurance_price}
                              onChange={e => setEditPolicies(prev => prev.map((p, i) => i === idx ? { ...p, insurance_price: parseFloat(e.target.value) || 0 } : p))} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Type changer (only for expense entries) */}
              {editRow.source === "expense" && (
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { v: "payment" as const, l: "سند صرف", I: ArrowUpRight, bc: "border-red-400 bg-red-50", tc: "text-red-600" },
                    { v: "sale" as const, l: "مبيعات", I: FileText, bc: "border-blue-400 bg-blue-50", tc: "text-blue-700" },
                    { v: "refund" as const, l: "مرتجع", I: RotateCcw, bc: "border-amber-400 bg-amber-50", tc: "text-amber-700" },
                    { v: "receipt" as const, l: "سند قبض", I: ArrowDownLeft, bc: "border-primary bg-primary/5", tc: "text-primary" },
                  ]).map(t => (
                    <button key={t.v} onClick={() => setEditType(t.v)}
                      className={cn("rounded-lg border-2 p-2 text-center text-xs transition-all", editType === t.v ? t.bc : "border-border")}>
                      <t.I className={cn("h-4 w-4 mx-auto mb-1", editType === t.v ? t.tc : "text-muted-foreground")} />
                      <p className={cn("font-bold", editType === t.v ? t.tc : "")}>{t.l}</p>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <Label>البيان</Label>
                <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="الوصف..." />
              </div>

              {/* Sale: simple amount + date | Policy: only issue date (amount edited per-policy above) */}
              {(editType === "sale" || editRow.source !== "expense") && (
                <div className={cn("grid gap-3", editRow.source === "policy" ? "grid-cols-1" : "grid-cols-2")}>
                  {editRow.source !== "policy" && (
                    <div className="space-y-1">
                      <Label>المبلغ *</Label>
                      <Input type="number" min="0" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label>{editRow.source === "policy" ? "تاريخ الإصدار *" : "التاريخ *"}</Label>
                    <ArabicDatePicker value={editDate} onChange={d => setEditDate(d)} compact />
                  </div>
                </div>
              )}

              {/* Payment lines for non-sale expense entries */}
              {editType !== "sale" && editRow.source === "expense" && (
                <ExpensePaymentLines
                  paymentLines={editPaymentLines}
                  setPaymentLines={setEditPaymentLines}
                  mainReceiptImages={editReceiptImages}
                  setMainReceiptImages={setEditReceiptImages}
                  mainNotes={editNotes}
                  setMainNotes={setEditNotes}
                  entityId={entityType === "company" ? (selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : "") : entityType === "broker" ? (selectedBrokerId !== "all" ? selectedBrokerId : "") : ""}
                  entityType={entityType === "company" ? "company" : "broker"}
                />
              )}

              {editRow.company_name && (
                <p className="text-xs text-muted-foreground">الجهة: {editRow.company_name}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>{editSaving ? "جاري الحفظ..." : "حفظ التعديلات"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
