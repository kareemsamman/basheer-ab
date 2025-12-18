import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, RefreshCw, Eye, FileText, Filter, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface Invoice {
  id: string;
  invoice_number: string;
  language: string;
  status: string;
  issued_at: string;
  pdf_url: string | null;
  metadata_json: any;
  policy_id: string;
  created_by_admin_id: string | null;
  policy?: {
    insurance_price: number;
    client?: { full_name: string };
    company?: { name: string; name_ar: string | null };
  };
  created_by?: { full_name: string | null; email: string };
}

export default function Invoices() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter, languageFilter]);

  const fetchInvoices = async () => {
    setLoading(true);
    let query = supabase
      .from('invoices')
      .select(`
        *,
        policy:policies(
          insurance_price,
          client:clients(full_name),
          company:insurance_companies(name, name_ar)
        ),
        created_by:profiles!invoices_created_by_admin_id_fkey(full_name, email)
      `)
      .order('issued_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (languageFilter !== 'all') {
      query = query.eq('language', languageFilter);
    }

    const { data, error } = await query.limit(100);

    setLoading(false);
    if (error) {
      toast({ title: "خطأ", description: "فشل في تحميل الفواتير", variant: "destructive" });
      return;
    }
    setInvoices(data || []);
  };

  const handleRegenerate = async (invoice: Invoice) => {
    if (!isAdmin) {
      toast({ title: "غير مصرح", description: "فقط المديرين يمكنهم إعادة إنشاء الفواتير", variant: "destructive" });
      return;
    }

    setRegenerating(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoices', {
        body: {
          policy_id: invoice.policy_id,
          languages: [invoice.language],
          regenerate: true,
        },
      });

      if (error) throw error;

      toast({ title: "تم بنجاح", description: "تم إعادة إنشاء الفاتورة" });
      fetchInvoices();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "فشل في إعادة إنشاء الفاتورة", variant: "destructive" });
    } finally {
      setRegenerating(null);
    }
  };

  const handlePrint = (invoice: Invoice) => {
    const htmlContent = invoice.metadata_json?.html_content;
    if (!htmlContent) {
      toast({ title: "خطأ", description: "لا يوجد محتوى للطباعة", variant: "destructive" });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(searchLower) ||
      inv.policy?.client?.full_name?.toLowerCase().includes(searchLower) ||
      inv.policy?.company?.name?.toLowerCase().includes(searchLower) ||
      inv.policy?.company?.name_ar?.toLowerCase().includes(searchLower)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'generated':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">تم الإنشاء</Badge>;
      case 'regenerated':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">تم التجديد</Badge>;
      case 'failed':
        return <Badge variant="destructive">فشل</Badge>;
      case 'pending':
        return <Badge variant="outline">قيد الإنشاء</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getLanguageLabel = (lang: string) => {
    return lang === 'ar' ? 'عربي' : lang === 'he' ? 'עברית' : lang;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">الفواتير</h1>
            <p className="text-muted-foreground">سندات القبض والقبلات</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الفاتورة، اسم العميل..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="generated">تم الإنشاء</SelectItem>
                <SelectItem value="regenerated">تم التجديد</SelectItem>
                <SelectItem value="failed">فشل</SelectItem>
                <SelectItem value="pending">قيد الإنشاء</SelectItem>
              </SelectContent>
            </Select>
            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="اللغة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل اللغات</SelectItem>
                <SelectItem value="ar">عربي</SelectItem>
                <SelectItem value="he">עברית</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchInvoices}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الفاتورة</TableHead>
                  <TableHead className="text-right">اللغة</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">الشركة</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">أنشئ بواسطة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      لا توجد فواتير
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getLanguageLabel(invoice.language)}</Badge>
                      </TableCell>
                      <TableCell>{invoice.policy?.client?.full_name || '-'}</TableCell>
                      <TableCell>{invoice.policy?.company?.name_ar || invoice.policy?.company?.name || '-'}</TableCell>
                      <TableCell className="font-medium">
                        ₪ {invoice.policy?.insurance_price?.toLocaleString() || '0'}
                      </TableCell>
                      <TableCell>
                        {new Date(invoice.issued_at).toLocaleDateString('ar-SA')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {invoice.created_by?.full_name || invoice.created_by?.email || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewInvoice(invoice)}
                            title="معاينة"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrint(invoice)}
                            title="طباعة/تحميل"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRegenerate(invoice)}
                              disabled={regenerating === invoice.id}
                              title="إعادة إنشاء"
                            >
                              {regenerating === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewInvoice} onOpenChange={() => setPreviewInvoice(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              معاينة الفاتورة - {previewInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {previewInvoice?.metadata_json?.html_content ? (
            <div 
              className="border rounded-lg p-4 bg-white"
              dangerouslySetInnerHTML={{ __html: previewInvoice.metadata_json.html_content }}
            />
          ) : (
            <p className="text-muted-foreground text-center py-8">لا يوجد محتوى للمعاينة</p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setPreviewInvoice(null)}>
              إغلاق
            </Button>
            <Button onClick={() => previewInvoice && handlePrint(previewInvoice)}>
              <Download className="h-4 w-4 ml-2" />
              طباعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
