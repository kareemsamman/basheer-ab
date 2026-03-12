import { useState, useCallback } from "react";
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
import { Plus, Printer, Pencil, Trash2, Search, Receipt, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  created_at: string;
}

function padReceiptNumber(num: number): string {
  return String(num).padStart(2, '0');
}

function useReceipts(tab: string, search: string, dateFrom: Date | undefined, dateTo: Date | undefined) {
  return useQuery({
    queryKey: ["receipts", tab, search, dateFrom?.toISOString(), dateTo?.toISOString()],
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

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ReceiptRow[];
    },
  });
}

const RECEIPT_TYPE_LABELS: Record<string, string> = {
  payment: "קבלה",
  accident_fee: "קבלת דמי תאונות",
};

export default function Receipts() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<ReceiptRow | null>(null);
  const [deleteReceipt, setDeleteReceipt] = useState<ReceiptRow | null>(null);

  // Form state
  const [formType, setFormType] = useState<"payment" | "accident_fee">("payment");
  const [formClientName, setFormClientName] = useState("");
  const [formCarNumber, setFormCarNumber] = useState("");
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formAmount, setFormAmount] = useState("");
  const [formAccidentDate, setFormAccidentDate] = useState("");
  const [formAccidentDetails, setFormAccidentDetails] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const { data: receipts, isLoading } = useReceipts(tab, search, dateFrom, dateTo);

  const resetForm = useCallback(() => {
    setFormType("payment");
    setFormClientName("");
    setFormCarNumber("");
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormAmount("");
    setFormAccidentDate("");
    setFormAccidentDetails("");
    setFormNotes("");
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

  const handlePrint = (r: ReceiptRow) => {
    const receiptTypeLabel = RECEIPT_TYPE_LABELS[r.receipt_type] || r.receipt_type;
    const paddedNum = padReceiptNumber(r.receipt_number);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const accidentSection = r.receipt_type === "accident_fee" ? `
      <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">תאריך תאונה</td><td style="padding:8px;border:1px solid #ccc;">${r.accident_date || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">פרטי תאונה</td><td style="padding:8px;border:1px solid #ccc;">${r.accident_details || '-'}</td></tr>
    ` : '';

    printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><title>${receiptTypeLabel} ${paddedNum}</title>
<style>
  body{font-family:Arial,Tahoma,sans-serif;padding:30px;direction:rtl;color:#1a1a1a}
  .container{max-width:700px;margin:0 auto;border:2px solid #1a3a5c;padding:0}
  .header{background:#1a3a5c;color:white;padding:20px 30px;text-align:center}
  .header h1{margin:0;font-size:22px}
  .header .en{margin:4px 0 0;font-size:11px;opacity:0.7;letter-spacing:1px}
  .header p{margin:4px 0 0;font-size:13px;opacity:0.8}
  .meta{display:flex;justify-content:space-between;padding:15px 30px;border-bottom:1px solid #ddd}
  .meta .num{font-size:20px;font-weight:bold;color:#c0392b}
  .meta .date{color:#666}
  .subject-bar{background:#d6e4f0;padding:10px 30px;font-weight:bold;font-size:15px;color:#1a3a5c;border-bottom:1px solid #b0c4d8}
  table{width:100%;border-collapse:collapse;margin:0}
  td{padding:10px 30px}
  .total{background:#e8f0fe;padding:15px 30px;text-align:center;font-size:24px;font-weight:bold;color:#1a3a5c}
  .footer{text-align:center;padding:15px;font-size:11px;color:#888;border-top:1px solid #ddd}
  @media print{body{padding:10px}}
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>בשיר אבו סנינה לביטוח</h1>
    <div class="en">BASHEER ABU SNEINEH INSURANCE</div>
    <p>עוסק מורשה: 212426498</p>
  </div>
  <div class="meta">
    <div><strong>${receiptTypeLabel}</strong> <span class="num">#${paddedNum}</span></div>
    <div class="date">${r.receipt_date}</div>
  </div>
  <div class="subject-bar">
    ביטוח רכב${r.car_number ? ` / רכב ${r.car_number}` : ''} / ${r.client_name}
  </div>
  <table>
    <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">שם לקוח</td><td style="padding:8px;border:1px solid #ccc;">${r.client_name}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">מס׳ רכב</td><td style="padding:8px;border:1px solid #ccc;">${r.car_number || '-'}</td></tr>
    ${accidentSection}
    ${r.notes ? `<tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">הערות</td><td style="padding:8px;border:1px solid #ccc;">${r.notes}</td></tr>` : ''}
  </table>
  <div class="total">₪${r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
  <div class="footer">🔒 חתימה דיגיטלית מאובטחת | הופק ${new Date().toLocaleDateString('en-GB')}</div>
</div>
<script>setTimeout(function(){window.print()},300)</script>
</body></html>`);
    printWindow.document.close();
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
                <TableHead className="text-right">מקור</TableHead>
                <TableHead className="text-right w-28">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : receipts && receipts.length > 0 ? (
                receipts.map((r) => (
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
                      <Badge variant={r.source === "auto" ? "secondary" : "outline"} className="text-xs">
                        {r.source === "auto" ? "אוטומטי" : "ידני"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(r)}>
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {r.source === "manual" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteReceipt(r)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
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
