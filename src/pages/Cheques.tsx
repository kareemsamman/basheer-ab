import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChequeRecord {
  id: string;
  policy_id: string;
  amount: number;
  payment_date: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  cheque_status: string | null;
  refused: boolean | null;
  notes: string | null;
  policy: {
    id: string;
    policy_type_parent: string;
    client: { id: string; full_name: string; broker_id: string | null } | null;
    car: { car_number: string } | null;
  } | null;
  broker_name?: string;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "قيد الانتظار", variant: "secondary" },
  cashed: { label: "تم صرفه", variant: "default" },
  returned: { label: "مرتجع", variant: "destructive" },
  cancelled: { label: "ملغي", variant: "outline" },
};

export default function Cheques() {
  const { toast } = useToast();
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fetchCheques = useCallback(async () => {
    setLoading(true);
    try {
      // First fetch cheque payments with related data
      let query = supabase
        .from('policy_payments')
        .select(`
          id, policy_id, amount, payment_date, cheque_number, cheque_image_url, 
          cheque_status, refused, notes,
          policies!policy_payments_policy_id_fkey(
            id, policy_type_parent,
            clients!policies_client_id_fkey(id, full_name, broker_id),
            cars!policies_car_id_fkey(car_number)
          )
        `, { count: 'exact' })
        .eq('payment_type', 'cheque')
        .order('payment_date', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      if (statusFilter !== "all") {
        query = query.eq('cheque_status', statusFilter);
      }

      if (overdueOnly) {
        const today = new Date().toISOString().split('T')[0];
        query = query
          .lt('payment_date', today)
          .neq('cheque_status', 'cashed');
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Get broker names for cheques with broker_id
      const brokerIds = [...new Set(
        (data || [])
          .map((c: any) => c.policies?.clients?.broker_id)
          .filter(Boolean)
      )];

      let brokerMap: Record<string, string> = {};
      if (brokerIds.length > 0) {
        const { data: brokers } = await supabase
          .from('brokers')
          .select('id, name')
          .in('id', brokerIds);
        
        brokerMap = (brokers || []).reduce((acc, b) => {
          acc[b.id] = b.name;
          return acc;
        }, {} as Record<string, string>);
      }

      const formattedCheques: ChequeRecord[] = (data || []).map((c: any) => ({
        id: c.id,
        policy_id: c.policy_id,
        amount: c.amount,
        payment_date: c.payment_date,
        cheque_number: c.cheque_number,
        cheque_image_url: c.cheque_image_url,
        cheque_status: c.cheque_status || 'pending',
        refused: c.refused,
        notes: c.notes,
        policy: c.policies ? {
          id: c.policies.id,
          policy_type_parent: c.policies.policy_type_parent,
          client: c.policies.clients,
          car: c.policies.cars,
        } : null,
        broker_name: c.policies?.clients?.broker_id 
          ? brokerMap[c.policies.clients.broker_id] 
          : undefined,
      }));

      // Filter by search query (client name)
      const filtered = searchQuery 
        ? formattedCheques.filter(c => 
            c.policy?.client?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.cheque_number?.includes(searchQuery)
          )
        : formattedCheques;

      setCheques(filtered);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching cheques:', error);
      toast({ title: "خطأ", description: "فشل في تحميل الشيكات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, overdueOnly, searchQuery, toast]);

  useEffect(() => {
    fetchCheques();
  }, [fetchCheques]);

  const handleStatusChange = async (chequeId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('policy_payments')
        .update({ 
          cheque_status: newStatus,
          refused: newStatus === 'returned',
        })
        .eq('id', chequeId);

      if (error) throw error;
      toast({ title: "تم التحديث", description: "تم تحديث حالة الشيك" });
      fetchCheques();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث الحالة", variant: "destructive" });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG');
  };

  const isOverdue = (dateStr: string, status: string | null) => {
    const today = new Date();
    const chequeDate = new Date(dateStr);
    return chequeDate < today && status !== 'cashed';
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <MainLayout>
      <Header
        title="الشيكات"
        subtitle="إدارة ومتابعة الشيكات"
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالعميل أو رقم الشيك..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pr-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="cashed">تم صرفه</SelectItem>
                <SelectItem value="returned">مرتجع</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant={overdueOnly ? "default" : "outline"} 
              size="sm"
              onClick={() => { setOverdueOnly(!overdueOnly); setCurrentPage(1); }}
            >
              <AlertCircle className="ml-2 h-4 w-4" />
              متأخرة
            </Button>
            <Button variant="outline" size="sm">
              <Download className="ml-2 h-4 w-4" />
              تصدير
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card className="border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-medium w-[80px]">الصورة</TableHead>
                  <TableHead className="text-muted-foreground font-medium">العميل</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الوسيط</TableHead>
                  <TableHead className="text-muted-foreground font-medium">رقم الشيك</TableHead>
                  <TableHead className="text-muted-foreground font-medium">المبلغ</TableHead>
                  <TableHead className="text-muted-foreground font-medium">تاريخ الاستحقاق</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الحالة</TableHead>
                  <TableHead className="text-muted-foreground font-medium w-[150px]">تغيير الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-12 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : cheques.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      لا توجد شيكات
                    </TableCell>
                  </TableRow>
                ) : (
                  cheques.map((cheque, index) => (
                    <TableRow
                      key={cheque.id}
                      className={cn(
                        "border-border/30 transition-colors animate-fade-in",
                        isOverdue(cheque.payment_date, cheque.cheque_status) && "bg-destructive/5"
                      )}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <TableCell>
                        {cheque.cheque_image_url ? (
                          <button
                            onClick={() => setPreviewImage(cheque.cheque_image_url)}
                            className="relative group"
                          >
                            <img
                              src={cheque.cheque_image_url}
                              alt="صورة الشيك"
                              className="h-12 w-16 object-cover rounded border"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                              <Eye className="h-4 w-4 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="h-12 w-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                            لا صورة
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {cheque.policy?.client?.full_name || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {cheque.broker_name || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm" dir="ltr">
                        {cheque.cheque_number || "-"}
                      </TableCell>
                      <TableCell className="font-medium" dir="ltr">
                        {formatCurrency(cheque.amount)}
                      </TableCell>
                      <TableCell className={cn(
                        isOverdue(cheque.payment_date, cheque.cheque_status) && "text-destructive font-medium"
                      )}>
                        {formatDate(cheque.payment_date)}
                        {isOverdue(cheque.payment_date, cheque.cheque_status) && (
                          <Badge variant="destructive" className="mr-2 text-xs">متأخر</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusLabels[cheque.cheque_status || 'pending']?.variant || 'secondary'}>
                          {statusLabels[cheque.cheque_status || 'pending']?.label || cheque.cheque_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={cheque.cheque_status || 'pending'}
                          onValueChange={(v) => handleStatusChange(cheque.id, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">قيد الانتظار</SelectItem>
                            <SelectItem value="cashed">تم صرفه</SelectItem>
                            <SelectItem value="returned">مرتجع</SelectItem>
                            <SelectItem value="cancelled">ملغي</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              عرض {cheques.length} من {totalCount} شيك
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {currentPage} من {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>صورة الشيك</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <img
              src={previewImage}
              alt="صورة الشيك"
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}