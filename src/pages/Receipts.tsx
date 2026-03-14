import React, { useState, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Printer, Pencil, Trash2, Search, Receipt, CalendarIcon, X, Link2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { buildReceiptPrintHtml, type ReceiptPrintData, type CompanySettings } from "@/lib/receiptPrintBuilder";

interface ReceiptRow {
  id: string;
  receipt_number: number;
  receipt_type: string;
  source: string;
  client_name: string;
  client_id: string | null;
  car_number: string | null;
  car_id: string | null;
  amount: number;
  receipt_date: string;
  accident_date: string | null;
  accident_details: string | null;
  payment_id: string | null;
  policy_id: string | null;
  notes: string | null;
  receipt_url: string | null;
  payment_method: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  card_last_four: string | null;
  created_at: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'מזומן',
  cheque: 'שיק',
  visa: 'כרטיס אשראי',
  credit_card: 'כרטיס אשראי',
  transfer: 'העברה בנקאית',
  bank_transfer: 'העברה בנקאית',
  accident_fee: 'דמי תאונות',
};

function padReceiptNumber(num: number): string {
  return String(num).padStart(2, '0');
}

function useReceipts(tab: string, search: string, dateFrom: Date | undefined, dateTo: Date | undefined, paymentMethodFilter: string) {
  return useQuery({
    queryKey: ["receipts", tab, search, dateFrom?.toISOString(), dateTo?.toISOString(), paymentMethodFilter],
    queryFn: async () => {
      let query = supabase
        .from("receipts")
        .select("*")
        .order("receipt_number", { ascending: false })
        .limit(500);

      if (tab === "payment") {
        query = query.eq("receipt_type", "payment");
      } else if (tab === "accident_fee") {
        query = query.eq("receipt_type", "accident_fee");
      }

      if (search.trim()) {
        query = query.or(`client_name.ilike.%${search}%,car_number.ilike.%${search}%`);
      }

      if (dateFrom) {
        query = query.gte("receipt_date", format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        query = query.lte("receipt_date", format(dateTo, "yyyy-MM-dd"));
      }

      if (paymentMethodFilter && paymentMethodFilter !== "all") {
        query = query.eq("payment_method", paymentMethodFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ReceiptRow[];
    },
  });
}

interface GroupedReceipt {
  key: string;
  receipts: ReceiptRow[];
  totalAmount: number;
  client_name: string;
  car_number: string | null;
  receipt_date: string;
  receipt_type: string;
  source: string;
  firstReceiptNumber: number;
  lastReceiptNumber: number;
}

function groupReceipts(receipts: ReceiptRow[]): GroupedReceipt[] {
  const map = new Map<string, ReceiptRow[]>();
  for (const r of receipts) {
    // Group by client + car + created_at rounded to same minute (payments entered together)
    const createdMinute = r.created_at ? r.created_at.slice(0, 16) : '';
    const key = `${r.client_name}|${r.car_number || ''}|${createdMinute}|${r.receipt_type}`;
    const group = map.get(key) || [];
    group.push(r);
    map.set(key, group);
  }
  const groups: GroupedReceipt[] = [];
  for (const [key, items] of map) {
    const sorted = items.sort((a, b) => a.receipt_number - b.receipt_number);
    groups.push({
      key,
      receipts: sorted,
      totalAmount: sorted.reduce((sum, r) => sum + r.amount, 0),
      client_name: sorted[0].client_name,
      car_number: sorted[0].car_number,
      receipt_date: sorted[0].receipt_date,
      receipt_type: sorted[0].receipt_type,
      source: sorted[0].source,
      firstReceiptNumber: sorted[0].receipt_number,
      lastReceiptNumber: sorted[sorted.length - 1].receipt_number,
    });
  }
  // Sort by first receipt number descending
  groups.sort((a, b) => b.lastReceiptNumber - a.lastReceiptNumber);
  return groups;
}

function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings-for-receipt"],
    queryFn: async () => {
      const [siteRes, smsRes] = await Promise.all([
        supabase.from("site_settings").select("logo_url").limit(1).single(),
        supabase.from("sms_settings").select("company_email, company_location, company_phone_links").limit(1).single(),
      ]);
      return {
        logoUrl: siteRes.data?.logo_url || "",
        company_email: (smsRes.data as any)?.company_email || "",
        company_location: (smsRes.data as any)?.company_location || "",
        company_phone_links: (smsRes.data as any)?.company_phone_links || [],
      } as CompanySettings;
    },
    staleTime: 1000 * 60 * 30,
  });
}

const RECEIPT_TYPE_LABELS: Record<string, string> = {
  payment: "קבלה",
  accident_fee: "קבלת דמי תאונות",
};

function formatPrintDate(dateStr: string): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getReceiptPaymentDetails(r: ReceiptRow): string {
  if (r.payment_method === "cheque") {
    if (!r.cheque_number) return "שיק";
    return `שיק מס׳ ${r.cheque_number}${r.cheque_date ? ` - ${formatPrintDate(r.cheque_date)}` : ""}`;
  }
  if ((r.payment_method === "visa" || r.payment_method === "credit_card") && r.card_last_four) {
    return `כרטיס ****${r.card_last_four}`;
  }
  return r.notes || "-";
}

function buildGroupedReceiptPrintHtml(group: GroupedReceipt, settings: CompanySettings): string {
  const phoneLinksHtml = (settings.company_phone_links || []).map((link) => `<span>${link.phone}</span>`).join(" | ");
  const logoImg = settings.logoUrl
    ? `<img src="${settings.logoUrl}" alt="Logo" class="logo" />`
    : `<div class="logo-placeholder">AB</div>`;

  const paymentRows = group.receipts
    .map(
      (r, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${PAYMENT_METHOD_LABELS[r.payment_method || ""] || "תשלום"}</td>
        <td>${getReceiptPaymentDetails(r)}</td>
        <td>${formatPrintDate(r.receipt_date)}</td>
        <td class="amount-cell">₪${r.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${RECEIPT_TYPE_LABELS[group.receipt_type] || group.receipt_type} ${group.client_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    @media print {
      body { padding: 0; background: white; }
      .no-print { display: none !important; }
      .container { box-shadow: none; border: none; }
    }
    body { font-family: Arial, Tahoma, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; color: #1a1a1a; background: #f0f2f5; padding: 20px; direction: rtl; }
    .container { max-width: 794px; margin: 0 auto; background: white; border: 2px solid #1a3a5c; min-height: 600px; }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 20px 30px; border-bottom: 3px solid #1a3a5c; }
    .header-right { display: flex; align-items: center; gap: 15px; }
    .logo { height: 70px; width: auto; object-fit: contain; }
    .logo-placeholder { width: 70px; height: 70px; background: #1a3a5c; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; border-radius: 8px; }
    .company-info { text-align: right; }
    .company-name { font-size: 22px; font-weight: bold; color: #1a3a5c; }
    .company-name-en { font-size: 11px; color: #666; letter-spacing: 1px; }
    .company-detail { font-size: 12px; color: #444; margin-top: 2px; }
    .header-left { text-align: left; font-size: 12px; color: #444; }
    .header-left div { margin-bottom: 2px; }
    .receipt-meta { display: flex; justify-content: space-between; align-items: center; padding: 15px 30px; border-bottom: 1px solid #ddd; }
    .receipt-label { font-size: 22px; font-weight: bold; color: #1a3a5c; }
    .receipt-num { font-size: 16px; font-weight: bold; color: #c0392b; }
    .client-row { display: flex; justify-content: space-between; padding: 12px 30px; border-bottom: 1px solid #ddd; font-size: 14px; }
    .client-name { font-weight: bold; }
    .subject-bar { background: #d6e4f0; padding: 10px 30px; font-weight: bold; font-size: 15px; color: #1a3a5c; border-bottom: 1px solid #b0c4d8; }
    .table-section { padding: 20px 30px; }
    .table-header-label { background: #1a3a5c; color: white; padding: 8px 16px; font-size: 14px; font-weight: bold; display: inline-block; border-radius: 4px 4px 0 0; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #ccc; }
    th { background: #e8eef4; color: #1a3a5c; font-weight: bold; padding: 10px 12px; font-size: 13px; border: 1px solid #ccc; text-align: center; }
    td { padding: 10px 12px; border: 1px solid #ccc; text-align: center; font-size: 13px; }
    .amount-cell { font-weight: bold; }
    .total-row { display: flex; justify-content: flex-end; align-items: center; padding: 15px 30px; gap: 15px; }
    .total-label { font-size: 16px; font-weight: bold; color: #1a3a5c; }
    .total-value { background: #1a3a5c; color: white; padding: 8px 24px; border-radius: 6px; font-size: 20px; font-weight: bold; }
    .footer { border-top: 2px solid #1a3a5c; padding: 12px 30px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #888; background: #fafafa; }
    .footer-badge { color: #1a3a5c; font-weight: bold; }
    .action-buttons { display: flex; gap: 10px; justify-content: center; padding: 20px; }
    .btn { padding: 10px 24px; border: none; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; font-family: Arial, Tahoma, sans-serif; background: #1a3a5c; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-right">
        ${logoImg}
        <div class="company-info">
          <div class="company-name">בשיר אבו סנינה לביטוח</div>
          <div class="company-name-en">BASHEER ABU SNEINEH INSURANCE</div>
          <div class="company-detail">עוסק מורשה: 212426498</div>
        </div>
      </div>
      <div class="header-left">
        ${settings.company_location ? `<div>📍 ${settings.company_location}</div>` : ""}
        ${phoneLinksHtml ? `<div>📞 ${phoneLinksHtml}</div>` : ""}
        ${settings.company_email ? `<div>📧 ${settings.company_email}</div>` : ""}
      </div>
    </div>

    <div class="receipt-meta">
      <span class="receipt-label">${RECEIPT_TYPE_LABELS[group.receipt_type] || group.receipt_type}</span>
      <span class="receipt-num">#${padReceiptNumber(group.firstReceiptNumber)}-${padReceiptNumber(group.lastReceiptNumber)}</span>
    </div>

    <div class="client-row">
      <div><span>לכבוד: </span><span class="client-name">${group.client_name}</span></div>
      <div>תאריך: ${formatPrintDate(group.receipt_date)}</div>
    </div>

    <div class="subject-bar">
      ביטוח רכב${group.car_number ? ` / רכב ${group.car_number}` : ""} / ${group.client_name}
    </div>

    <div class="table-section">
      <div class="table-header-label">פרטי תשלומים</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>אמצעי תשלום</th>
            <th>פירוט</th>
            <th>תאריך</th>
            <th>סכום</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows}
        </tbody>
      </table>
    </div>

    <div class="total-row">
      <span class="total-label">סה"כ</span>
      <span class="total-value">₪${group.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>

    <div class="footer">
      <div class="footer-badge">🔒 חתימה דיגיטלית מאובטחת</div>
      <div>הופק ב ${formatPrintDate(new Date().toISOString())} | ${group.receipts.length} תשלומים</div>
    </div>
  </div>

  <div class="action-buttons no-print">
    <button class="btn" onclick="window.print()">🖨️ הדפסה</button>
  </div>

  <script>
    setTimeout(function(){ window.print(); }, 500);
  </script>
</body>
</html>`;
}

export default function Receipts() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<ReceiptRow | null>(null);
  const [deleteReceipt, setDeleteReceipt] = useState<ReceiptRow | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Form state
  const [formType, setFormType] = useState<"payment" | "accident_fee">("payment");
  const [formClientName, setFormClientName] = useState("");
  const [formCarNumber, setFormCarNumber] = useState("");
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formAmount, setFormAmount] = useState("");
  const [formAccidentDate, setFormAccidentDate] = useState("");
  const [formAccidentDetails, setFormAccidentDetails] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("cash");
  const [formChequeNumber, setFormChequeNumber] = useState("");
  const [formChequeDate, setFormChequeDate] = useState("");
  const { data: receipts, isLoading } = useReceipts(tab, search, dateFrom, dateTo, paymentMethodFilter);
  const { data: companySettings } = useCompanySettings();
  
  const groupedReceipts = receipts ? groupReceipts(receipts) : [];

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetForm = useCallback(() => {
    setFormType("payment");
    setFormClientName("");
    setFormCarNumber("");
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormAmount("");
    setFormAccidentDate("");
    setFormAccidentDetails("");
    setFormNotes("");
    setFormPaymentMethod("cash");
    setFormChequeNumber("");
    setFormChequeDate("");
    setEditingReceipt(null);
  }, []);

  const openNew = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (r: ReceiptRow) => {
    setEditingReceipt(r);
    setFormType(r.receipt_type as "payment" | "accident_fee");
    setFormClientName(r.client_name);
    setFormCarNumber(r.car_number || "");
    setFormDate(r.receipt_date);
    setFormAmount(String(r.amount));
    setFormAccidentDate(r.accident_date || "");
    setFormAccidentDetails(r.accident_details || "");
    setFormNotes(r.notes || "");
    setFormPaymentMethod(r.payment_method || "cash");
    setFormChequeNumber(r.cheque_number || "");
    setFormChequeDate(r.cheque_date || "");
    setDrawerOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        receipt_type: formType,
        client_name: formClientName,
        car_number: formCarNumber || null,
        amount: parseFloat(formAmount) || 0,
        receipt_date: formDate,
        accident_date: formType === "accident_fee" ? formAccidentDate || null : null,
        accident_details: formType === "accident_fee" ? formAccidentDetails || null : null,
        notes: formNotes || null,
        source: "manual" as const,
        payment_method: formPaymentMethod || null,
        cheque_number: formPaymentMethod === "cheque" ? formChequeNumber || null : null,
        cheque_date: formPaymentMethod === "cheque" && formChequeDate ? formChequeDate : null,
      };

      if (editingReceipt) {
        const { error } = await supabase
          .from("receipts")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingReceipt.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("receipts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingReceipt ? "הקבלה עודכנה בהצלחה" : "הקבלה נוצרה בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      setDrawerOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error("שגיאה: " + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("receipts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הקבלה נמחקה בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      setDeleteReceipt(null);
    },
    onError: (err: any) => {
      toast.error("שגיאה: " + err.message);
    },
  });

  const handlePrint = async (r: ReceiptRow) => {
    let paymentMethod = r.payment_method || '';
    let chequeNumber = r.cheque_number || '';
    let chequeDate = r.cheque_date || '';
    let cardLastFour = r.card_last_four || '';

    // For auto receipts, fetch payment details if not stored on receipt
    if (r.source === 'auto' && r.payment_id && !r.payment_method) {
      const { data: paymentData } = await supabase
        .from('policy_payments')
        .select('payment_type, cheque_number, card_last_four, cheque_date')
        .eq('id', r.payment_id)
        .single();
      if (paymentData) {
        paymentMethod = paymentData.payment_type || '';
        chequeNumber = paymentData.cheque_number || '';
        cardLastFour = paymentData.card_last_four || '';
        chequeDate = paymentData.cheque_date || '';
      }
    }

    const data: ReceiptPrintData = {
      receiptNumber: padReceiptNumber(r.receipt_number),
      receiptType: r.receipt_type,
      receiptTypeLabel: RECEIPT_TYPE_LABELS[r.receipt_type] || r.receipt_type,
      clientName: r.client_name,
      carNumber: r.car_number || "",
      receiptDate: r.receipt_date,
      amount: r.amount,
      accidentDate: r.accident_date || "",
      accidentDetails: r.accident_details || "",
      notes: r.notes || "",
      source: r.source,
      paymentMethod,
      chequeNumber,
      chequeDate,
      cardLastFour,
    };
    const html = buildReceiptPrintHtml(data, companySettings || { logoUrl: "", company_email: "", company_location: "", company_phone_links: [] });
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleCopyLink = async (r: ReceiptRow) => {
    // If receipt already has a URL, just copy it
    if (r.receipt_url) {
      await navigator.clipboard.writeText(r.receipt_url);
      toast.success("הקישור הועתק");
      return;
    }

    // For auto receipts with payment_id, generate via edge function
    if (r.source === "auto" && r.payment_id) {
      setCopyingId(r.id);
      try {
        const { data, error } = await supabase.functions.invoke("generate-payment-receipt", {
          body: { payment_id: r.payment_id },
        });
        if (error) throw error;
        const url = data?.receipt_url || data?.url;
        if (url) {
          // Update the receipt row with the URL
          await supabase.from("receipts").update({ receipt_url: url }).eq("id", r.id);
          queryClient.invalidateQueries({ queryKey: ["receipts"] });
          await navigator.clipboard.writeText(url);
          toast.success("הקישור הועתק");
        } else {
          toast.error("לא נוצר קישור");
        }
      } catch (err: any) {
        toast.error("שגיאה: " + err.message);
      } finally {
        setCopyingId(null);
      }
      return;
    }

    // For manual receipts, open the print view and let them copy from there
    toast.info("לקבלות ידניות, השתמש בהדפסה");
  };

  const clearDateFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <MainLayout>
      <Header
        title="קבלות"
        subtitle="ניהול קבלות תשלום"
        action={{ label: "קבלה חדשה", onClick: openNew }}
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Search + Tabs + Date Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
              <TabsList>
                <TabsTrigger value="all">הכל</TabsTrigger>
                <TabsTrigger value="payment">קבלה</TabsTrigger>
                <TabsTrigger value="accident_fee">דמי תאונות</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם / מס׳ רכב..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
          </div>

          {/* Date range filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">סינון לפי תאריך:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "מתאריך"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <span className="text-sm text-muted-foreground">עד</span>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-2 text-sm", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy") : "עד תאריך"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={clearDateFilters} className="gap-1 text-xs">
                <X className="h-3 w-3" />
                נקה
              </Button>
            )}
          </div>

          {/* Payment method filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">אמצעי תשלום:</span>
            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="cash">מזומן</SelectItem>
                <SelectItem value="cheque">שיק</SelectItem>
                <SelectItem value="visa">כרטיס אשראי</SelectItem>
                <SelectItem value="transfer">העברה בנקאית</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-16">#</TableHead>
                <TableHead className="text-right">סוג</TableHead>
                <TableHead className="text-right">שם לקוח</TableHead>
                <TableHead className="text-right">מס׳ רכב</TableHead>
                <TableHead className="text-right">תאריך</TableHead>
                <TableHead className="text-right">סכום</TableHead>
                <TableHead className="text-right">אמצעי תשלום</TableHead>
                <TableHead className="text-right">מקור</TableHead>
                <TableHead className="text-right w-32">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : groupedReceipts.length > 0 ? (
                groupedReceipts.map((group) => {
                  const isMulti = group.receipts.length > 1;
                  const isExpanded = expandedGroups.has(group.key);
                  const primary = group.receipts[0];
                  
                  // For single receipts, show normally
                  if (!isMulti) {
                    const r = primary;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{padReceiptNumber(r.receipt_number)}</TableCell>
                        <TableCell>
                          <Badge variant={r.receipt_type === "accident_fee" ? "destructive" : "default"} className="text-xs">
                            {RECEIPT_TYPE_LABELS[r.receipt_type] || r.receipt_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{r.client_name}</TableCell>
                        <TableCell className="font-mono text-sm">{r.car_number || "-"}</TableCell>
                        <TableCell>{r.receipt_date}</TableCell>
                        <TableCell className="font-bold">₪{r.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{PAYMENT_METHOD_LABELS[r.payment_method || ''] || '-'}</span>
                            {r.payment_method === 'visa' && r.card_last_four && (
                              <Badge variant="secondary" className="text-xs font-mono">****{r.card_last_four}</Badge>
                            )}
                            {r.payment_method === 'cheque' && r.cheque_number && (
                              <Badge variant="outline" className="text-xs font-mono">{r.cheque_number}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.source === "auto" ? "secondary" : "outline"} className="text-xs">
                            {r.source === "auto" ? "אוטומטי" : "ידני"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(r)} title="הדפסה">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(r)} disabled={copyingId === r.id} title="העתק קישור">
                              {copyingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                            </Button>
                            {r.source === "manual" && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="עריכה">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteReceipt(r)} title="מחיקה">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // For multi-receipt groups
                  const receiptRange = `${padReceiptNumber(group.firstReceiptNumber)}-${padReceiptNumber(group.lastReceiptNumber)}`;
                  // Collect unique payment methods
                  const methods = [...new Set(group.receipts.map(r => r.payment_method).filter(Boolean))];
                  
                  return (
                    <React.Fragment key={group.key}>
                      <TableRow 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleGroup(group.key)}
                      >
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {receiptRange}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={group.receipt_type === "accident_fee" ? "destructive" : "default"} className="text-xs">
                            {RECEIPT_TYPE_LABELS[group.receipt_type] || group.receipt_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{group.client_name}</TableCell>
                        <TableCell className="font-mono text-sm">{group.car_number || "-"}</TableCell>
                        <TableCell>{group.receipt_date}</TableCell>
                        <TableCell className="font-bold">
                          ₪{group.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          <Badge variant="secondary" className="text-xs mr-1">{group.receipts.length} תשלומים</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            {methods.map(m => (
                              <span key={m} className="text-sm">{PAYMENT_METHOD_LABELS[m || ''] || m}</span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={group.source === "auto" ? "secondary" : "outline"} className="text-xs">
                            {group.source === "auto" ? "אוטומטי" : "ידני"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handlePrint(primary); }} title="הדפסה">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && group.receipts.map((r) => (
                        <TableRow key={r.id} className="bg-muted/30">
                          <TableCell className="font-mono text-xs pr-8">{padReceiptNumber(r.receipt_number)}</TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell className="font-bold text-sm">₪{r.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="text-sm">{PAYMENT_METHOD_LABELS[r.payment_method || ''] || '-'}</span>
                              {r.payment_method === 'visa' && r.card_last_four && (
                                <Badge variant="secondary" className="text-xs font-mono">****{r.card_last_four}</Badge>
                              )}
                              {r.payment_method === 'cheque' && r.cheque_number && (
                                <Badge variant="outline" className="text-xs font-mono">{r.cheque_number}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(r)} title="הדפסה">
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(r)} disabled={copyingId === r.id} title="העתק קישור">
                                {copyingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>אין קבלות</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create / Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) { setDrawerOpen(false); resetForm(); } else setDrawerOpen(true); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingReceipt ? "עריכת קבלה" : "קבלה חדשה"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>סוג קבלה</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as "payment" | "accident_fee")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">קבלה</SelectItem>
                  <SelectItem value="accident_fee">קבלת דמי תאונות</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>שם לקוח *</Label>
              <Input value={formClientName} onChange={(e) => setFormClientName(e.target.value)} placeholder="שם הלקוח" />
            </div>

            <div className="space-y-2">
              <Label>מס׳ רכב</Label>
              <Input value={formCarNumber} onChange={(e) => setFormCarNumber(e.target.value)} placeholder="מספר רכב" />
            </div>

            <div className="space-y-2">
              <Label>תאריך</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>סכום (₪) *</Label>
              <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" />
            </div>

            {formType === "accident_fee" && (
              <>
                <div className="space-y-2">
                  <Label>תאריך תאונה</Label>
                  <Input type="date" value={formAccidentDate} onChange={(e) => setFormAccidentDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>פרטי תאונה</Label>
                  <Textarea value={formAccidentDetails} onChange={(e) => setFormAccidentDetails(e.target.value)} placeholder="תיאור התאונה..." rows={3} />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>אמצעי תשלום</Label>
              <Select value={formPaymentMethod} onValueChange={setFormPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">מזומן</SelectItem>
                  <SelectItem value="cheque">שיק</SelectItem>
                  <SelectItem value="visa">כרטיס אשראי</SelectItem>
                  <SelectItem value="transfer">העברה בנקאית</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formPaymentMethod === "cheque" && (
              <>
                <div className="space-y-2">
                  <Label>מספר שיק</Label>
                  <Input value={formChequeNumber} onChange={(e) => setFormChequeNumber(e.target.value)} placeholder="מספר השיק" />
                </div>
                <div className="space-y-2">
                  <Label>תאריך שיק</Label>
                  <Input type="date" value={formChequeDate} onChange={(e) => setFormChequeDate(e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>הערות</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="הערות נוספות..." rows={2} />
            </div>

            <Button
              className="w-full"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !formClientName || !formAmount}
            >
              {saveMutation.isPending ? "שומר..." : editingReceipt ? "עדכון" : "שמור קבלה"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={!!deleteReceipt}
        onOpenChange={(open) => !open && setDeleteReceipt(null)}
        onConfirm={() => deleteReceipt && deleteMutation.mutate(deleteReceipt.id)}
        title="מחיקת קבלה"
        description={`האם אתה בטוח שברצונך למחוק קבלה #${deleteReceipt ? padReceiptNumber(deleteReceipt.receipt_number) : ''}?`}
      />
    </MainLayout>
  );
}
