import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Upload,
  MessageSquare,
  Edit,
  BarChart3,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PaymentImage {
  id: string;
  image_url: string;
  image_type: string;
}

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
    client: { id: string; full_name: string; broker_id: string | null; phone_number: string | null } | null;
    car: { car_number: string } | null;
  } | null;
  broker_name?: string;
  images?: PaymentImage[];
}

interface MonthlyStats {
  month: string;
  total: number;
  totalAmount: number;
  pending: number;
  pendingAmount: number;
  cashed: number;
  cashedAmount: number;
  returned: number;
  returnedAmount: number;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "قيد الانتظار", variant: "secondary" },
  cashed: { label: "تم صرفه", variant: "default" },
  returned: { label: "مرتجع", variant: "destructive" },
  cancelled: { label: "ملغي", variant: "outline" },
};

export default function Cheques() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Image upload state
  const [uploadingForChequeId, setUploadingForChequeId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unique customers for filter
  const [uniqueCustomers, setUniqueCustomers] = useState<{ id: string; name: string }[]>([]);

  // Summary stats
  const [summaryStats, setSummaryStats] = useState({
    returnedCount: 0,
    returnedTotal: 0,
    pendingCount: 0,
    pendingTotal: 0,
  });

  // Monthly statistics
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);

  // Bulk selection
  const [selectedCheques, setSelectedCheques] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Edit cheque dialog
  const [editingCheque, setEditingCheque] = useState<ChequeRecord | null>(null);
  const [editChequeNumber, setEditChequeNumber] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // SMS dialog for returned cheques
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [smsCheque, setSmsCheque] = useState<ChequeRecord | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [sendingSms, setSendingSms] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState("list");

  // Fetch summary stats separately (not affected by filters)
  const fetchSummaryStats = useCallback(async () => {
    try {
      const { data: allCheques } = await supabase
        .from('policy_payments')
        .select('amount, cheque_status, payment_date')
        .eq('payment_type', 'cheque');

      if (allCheques) {
        const returnedCheques = allCheques.filter(c => c.cheque_status === 'returned');
        const pendingCheques = allCheques.filter(c => c.cheque_status === 'pending' || !c.cheque_status);
        
        setSummaryStats({
          returnedCount: returnedCheques.length,
          returnedTotal: returnedCheques.reduce((sum, c) => sum + Number(c.amount), 0),
          pendingCount: pendingCheques.length,
          pendingTotal: pendingCheques.reduce((sum, c) => sum + Number(c.amount), 0),
        });

        // Calculate monthly stats
        const monthlyMap: Record<string, MonthlyStats> = {};
        allCheques.forEach(c => {
          const date = new Date(c.payment_date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          
          if (!monthlyMap[monthKey]) {
            monthlyMap[monthKey] = {
              month: monthKey,
              total: 0, totalAmount: 0,
              pending: 0, pendingAmount: 0,
              cashed: 0, cashedAmount: 0,
              returned: 0, returnedAmount: 0,
            };
          }
          
          monthlyMap[monthKey].total++;
          monthlyMap[monthKey].totalAmount += Number(c.amount);
          
          const status = c.cheque_status || 'pending';
          if (status === 'pending') {
            monthlyMap[monthKey].pending++;
            monthlyMap[monthKey].pendingAmount += Number(c.amount);
          } else if (status === 'cashed') {
            monthlyMap[monthKey].cashed++;
            monthlyMap[monthKey].cashedAmount += Number(c.amount);
          } else if (status === 'returned') {
            monthlyMap[monthKey].returned++;
            monthlyMap[monthKey].returnedAmount += Number(c.amount);
          }
        });

        const sortedMonths = Object.values(monthlyMap).sort((a, b) => b.month.localeCompare(a.month));
        setMonthlyStats(sortedMonths);
      }
    } catch (error) {
      console.error('Error fetching summary stats:', error);
    }
  }, []);

  const fetchCheques = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('policy_payments')
        .select(`
          id, policy_id, amount, payment_date, cheque_number, cheque_image_url, 
          cheque_status, refused, notes,
          policies!policy_payments_policy_id_fkey(
            id, policy_type_parent,
            clients!policies_client_id_fkey(id, full_name, broker_id, phone_number),
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
        query = query.lt('payment_date', today).neq('cheque_status', 'cashed');
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const paymentIds = (data || []).map((c: any) => c.id);
      
      let imagesMap: Record<string, PaymentImage[]> = {};
      if (paymentIds.length > 0) {
        const { data: images } = await supabase
          .from('payment_images')
          .select('id, payment_id, image_url, image_type')
          .in('payment_id', paymentIds);
        
        imagesMap = (images || []).reduce((acc, img) => {
          if (!acc[img.payment_id]) acc[img.payment_id] = [];
          acc[img.payment_id].push({ id: img.id, image_url: img.image_url, image_type: img.image_type });
          return acc;
        }, {} as Record<string, PaymentImage[]>);
      }

      const brokerIds = [...new Set(
        (data || []).map((c: any) => c.policies?.clients?.broker_id).filter(Boolean)
      )];

      let brokerMap: Record<string, string> = {};
      if (brokerIds.length > 0) {
        const { data: brokers } = await supabase.from('brokers').select('id, name').in('id', brokerIds);
        brokerMap = (brokers || []).reduce((acc, b) => { acc[b.id] = b.name; return acc; }, {} as Record<string, string>);
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
        broker_name: c.policies?.clients?.broker_id ? brokerMap[c.policies.clients.broker_id] : undefined,
        images: imagesMap[c.id] || [],
      }));

      let filtered = searchQuery 
        ? formattedCheques.filter(c => 
            c.policy?.client?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.cheque_number?.includes(searchQuery)
          )
        : formattedCheques;

      if (customerFilter !== "all") {
        filtered = filtered.filter(c => c.policy?.client?.id === customerFilter);
      }

      if (sortBy === "customer") {
        filtered.sort((a, b) => {
          const nameA = a.policy?.client?.full_name || "";
          const nameB = b.policy?.client?.full_name || "";
          return nameA.localeCompare(nameB, 'ar');
        });
      }

      const customers = [...new Map(
        formattedCheques
          .filter(c => c.policy?.client?.id && c.policy?.client?.full_name)
          .map(c => [c.policy!.client!.id, { id: c.policy!.client!.id, name: c.policy!.client!.full_name }])
      ).values()];
      setUniqueCustomers(customers);

      setCheques(filtered);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching cheques:', error);
      toast({ title: "خطأ", description: "فشل في تحميل الشيكات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, overdueOnly, searchQuery, customerFilter, sortBy, toast]);

  useEffect(() => { fetchSummaryStats(); }, [fetchSummaryStats]);
  useEffect(() => { fetchCheques(); }, [fetchCheques]);

  const handleStatusChange = async (chequeId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('policy_payments')
        .update({ cheque_status: newStatus, refused: newStatus === 'returned' })
        .eq('id', chequeId);

      if (error) throw error;
      toast({ title: "تم التحديث", description: "تم تحديث حالة الشيك" });
      fetchCheques();
      fetchSummaryStats();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث الحالة", variant: "destructive" });
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedCheques.size === 0) return;
    
    setBulkActionLoading(true);
    try {
      const { error } = await supabase
        .from('policy_payments')
        .update({ cheque_status: newStatus, refused: newStatus === 'returned' })
        .in('id', Array.from(selectedCheques));

      if (error) throw error;
      toast({ title: "تم التحديث", description: `تم تحديث ${selectedCheques.size} شيك` });
      setSelectedCheques(new Set());
      fetchCheques();
      fetchSummaryStats();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث الحالة", variant: "destructive" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleEditCheque = (cheque: ChequeRecord) => {
    setEditingCheque(cheque);
    setEditChequeNumber(cheque.cheque_number || "");
    setEditDialogOpen(true);
  };

  const saveEditedCheque = async () => {
    if (!editingCheque) return;
    
    try {
      const { error } = await supabase
        .from('policy_payments')
        .update({ 
          cheque_number: editChequeNumber.replace(/\D/g, ''),
          cheque_status: 'pending',
          refused: false,
        })
        .eq('id', editingCheque.id);

      if (error) throw error;
      toast({ title: "تم التحديث", description: "تم تحديث رقم الشيك وإعادة الحالة إلى قيد الانتظار" });
      setEditDialogOpen(false);
      setEditingCheque(null);
      fetchCheques();
      fetchSummaryStats();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث الشيك", variant: "destructive" });
    }
  };

  const openSmsDialog = (cheque: ChequeRecord) => {
    setSmsCheque(cheque);
    const clientName = cheque.policy?.client?.full_name || "العميل";
    const chequeNum = cheque.cheque_number || "";
    setSmsMessage(`مرحباً ${clientName}، نود إعلامك بأن الشيك رقم ${chequeNum} بمبلغ ${formatCurrency(cheque.amount)} قد تم إرجاعه. يرجى التواصل معنا لتسوية الأمر.`);
    setSmsDialogOpen(true);
  };

  const sendReturnedChequeSms = async () => {
    if (!smsCheque || !smsCheque.policy?.client?.phone_number) {
      toast({ title: "خطأ", description: "لا يوجد رقم هاتف للعميل", variant: "destructive" });
      return;
    }

    setSendingSms(true);
    try {
      const { error } = await supabase.functions.invoke('send-sms', {
        body: {
          phone: smsCheque.policy.client.phone_number,
          message: smsMessage,
          clientId: smsCheque.policy.client.id,
          policyId: smsCheque.policy_id,
          smsType: 'manual',
        }
      });

      if (error) throw error;
      toast({ title: "تم الإرسال", description: "تم إرسال الرسالة بنجاح" });
      setSmsDialogOpen(false);
      setSmsCheque(null);
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في إرسال الرسالة", variant: "destructive" });
    } finally {
      setSendingSms(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG');
  };

  const formatMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  };

  const isOverdue = (dateStr: string, status: string | null) => {
    const today = new Date();
    const chequeDate = new Date(dateStr);
    return chequeDate < today && status !== 'cashed';
  };

  const handleImageUpload = async (chequeId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `cheque_${chequeId}_${Date.now()}.${fileExt}`;
        const filePath = `payments/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file);

        if (uploadError) {
          if (uploadError.message.includes('not found')) {
            await supabase.storage.createBucket('media', { public: true });
            await supabase.storage.from('media').upload(filePath, file);
          } else {
            throw uploadError;
          }
        }

        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);

        const { error: insertError } = await supabase
          .from('payment_images')
          .insert({ payment_id: chequeId, image_url: publicUrl, image_type: 'cheque' });

        if (insertError) throw insertError;
      }

      toast({ title: "تم الرفع", description: "تم رفع الصور بنجاح" });
      fetchCheques();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({ title: "خطأ", description: "فشل في رفع الصور", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadingForChequeId(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCheques.size === cheques.length) {
      setSelectedCheques(new Set());
    } else {
      setSelectedCheques(new Set(cheques.map(c => c.id)));
    }
  };

  const toggleSelectCheque = (chequeId: string) => {
    const newSelected = new Set(selectedCheques);
    if (newSelected.has(chequeId)) {
      newSelected.delete(chequeId);
    } else {
      newSelected.add(chequeId);
    }
    setSelectedCheques(newSelected);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <MainLayout>
      <Header title="الشيكات" subtitle="إدارة ومتابعة الشيكات" />

      <div className="p-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">شيكات مرتجعة</p>
                <p className="text-xl font-bold text-destructive" dir="ltr">
                  {formatCurrency(summaryStats.returnedTotal)}
                </p>
                <p className="text-xs text-muted-foreground">{summaryStats.returnedCount} شيك</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">شيكات قيد الانتظار</p>
                <p className="text-xl font-bold text-amber-600" dir="ltr">
                  {formatCurrency(summaryStats.pendingTotal)}
                </p>
                <p className="text-xs text-muted-foreground">{summaryStats.pendingCount} شيك</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list" className="gap-2">
              <CheckSquare className="h-4 w-4" />
              قائمة الشيكات
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              التقرير الشهري
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="mt-4">
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">إحصائيات الشيكات الشهرية</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الشهر</TableHead>
                      <TableHead className="text-center">إجمالي الشيكات</TableHead>
                      <TableHead className="text-center">قيد الانتظار</TableHead>
                      <TableHead className="text-center">تم صرفها</TableHead>
                      <TableHead className="text-center">مرتجعة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          لا توجد بيانات
                        </TableCell>
                      </TableRow>
                    ) : (
                      monthlyStats.map((month) => (
                        <TableRow key={month.month}>
                          <TableCell className="font-medium">{formatMonthName(month.month)}</TableCell>
                          <TableCell className="text-center">
                            <div>{month.total} شيك</div>
                            <div className="text-xs text-muted-foreground" dir="ltr">{formatCurrency(month.totalAmount)}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{month.pending}</Badge>
                            <div className="text-xs text-muted-foreground mt-1" dir="ltr">{formatCurrency(month.pendingAmount)}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default">{month.cashed}</Badge>
                            <div className="text-xs text-muted-foreground mt-1" dir="ltr">{formatCurrency(month.cashedAmount)}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive">{month.returned}</Badge>
                            <div className="text-xs text-muted-foreground mt-1" dir="ltr">{formatCurrency(month.returnedAmount)}</div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="list" className="mt-4 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث بالعميل أو رقم الشيك..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pr-9"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={customerFilter} onValueChange={(v) => { setCustomerFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع العملاء</SelectItem>
                    {uniqueCustomers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="ترتيب حسب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">التاريخ</SelectItem>
                    <SelectItem value="customer">العميل</SelectItem>
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
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedCheques.size > 0 && (
              <Card className="p-3 bg-primary/5 border-primary/20">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium">تم تحديد {selectedCheques.size} شيك</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500/50 text-green-600 hover:bg-green-500/10"
                    onClick={() => handleBulkStatusChange('cashed')}
                    disabled={bulkActionLoading}
                  >
                    <CheckCircle2 className="h-4 w-4 ml-1" />
                    صرف الكل
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={() => handleBulkStatusChange('returned')}
                    disabled={bulkActionLoading}
                  >
                    <RotateCcw className="h-4 w-4 ml-1" />
                    إرجاع الكل
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCheques(new Set())}
                  >
                    إلغاء التحديد
                  </Button>
                </div>
              </Card>
            )}

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (uploadingForChequeId) {
                  handleImageUpload(uploadingForChequeId, e.target.files);
                }
              }}
            />

            {/* Table */}
            <Card className="border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedCheques.size === cheques.length && cheques.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-muted-foreground font-medium w-[100px]">الصورة</TableHead>
                      <TableHead className="text-muted-foreground font-medium">العميل</TableHead>
                      <TableHead className="text-muted-foreground font-medium">الوسيط</TableHead>
                      <TableHead className="text-muted-foreground font-medium">رقم الشيك</TableHead>
                      <TableHead className="text-muted-foreground font-medium">المبلغ</TableHead>
                      <TableHead className="text-muted-foreground font-medium">تاريخ الاستحقاق</TableHead>
                      <TableHead className="text-muted-foreground font-medium">الحالة</TableHead>
                      <TableHead className="text-muted-foreground font-medium w-[280px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-4" /></TableCell>
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
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          لا توجد شيكات
                        </TableCell>
                      </TableRow>
                    ) : (
                      cheques.map((cheque, index) => (
                        <TableRow
                          key={cheque.id}
                          className={cn(
                            "border-border/30 transition-colors animate-fade-in",
                            isOverdue(cheque.payment_date, cheque.cheque_status) && "bg-destructive/5",
                            selectedCheques.has(cheque.id) && "bg-primary/5"
                          )}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedCheques.has(cheque.id)}
                              onCheckedChange={() => toggleSelectCheque(cheque.id)}
                            />
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const allImages = [
                                cheque.cheque_image_url,
                                ...(cheque.images?.map(i => i.image_url) || [])
                              ].filter(Boolean);
                              
                              return (
                                <div className="flex items-center gap-1">
                                  {allImages.length > 0 ? (
                                    <button
                                      onClick={() => {
                                        setGalleryImages(allImages as string[]);
                                        setGalleryIndex(0);
                                        setGalleryOpen(true);
                                      }}
                                      className="relative group"
                                    >
                                      <img src={allImages[0]!} alt="صورة الشيك" className="h-12 w-16 object-cover rounded border" />
                                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center gap-1">
                                        <Eye className="h-4 w-4 text-white" />
                                        {allImages.length > 1 && <span className="text-white text-xs font-bold">+{allImages.length - 1}</span>}
                                      </div>
                                    </button>
                                  ) : (
                                    <div className="h-12 w-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">لا صورة</div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={uploading}
                                    onClick={() => { setUploadingForChequeId(cheque.id); fileInputRef.current?.click(); }}
                                    title="رفع صورة"
                                  >
                                    <Upload className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="font-medium">
                            <button className="hover:text-primary hover:underline text-right" onClick={() => setCustomerFilter(cheque.policy?.client?.id || "all")}>
                              {cheque.policy?.client?.full_name || "-"}
                            </button>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{cheque.broker_name || "-"}</TableCell>
                          <TableCell className="font-mono text-sm" dir="ltr">{cheque.cheque_number || "-"}</TableCell>
                          <TableCell className="font-medium" dir="ltr">{formatCurrency(cheque.amount)}</TableCell>
                          <TableCell className={cn(isOverdue(cheque.payment_date, cheque.cheque_status) && "text-destructive font-medium")}>
                            {formatDate(cheque.payment_date)}
                            {isOverdue(cheque.payment_date, cheque.cheque_status) && <Badge variant="destructive" className="mr-2 text-xs">متأخر</Badge>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusLabels[cheque.cheque_status || 'pending']?.variant || 'secondary'}>
                              {statusLabels[cheque.cheque_status || 'pending']?.label || cheque.cheque_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate(`/policies?highlight=${cheque.policy_id}`)}>
                                <ExternalLink className="h-3 w-3 ml-1" />
                                الوثيقة
                              </Button>
                              {cheque.cheque_status === 'returned' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleEditCheque(cheque)}
                                  >
                                    <Edit className="h-3 w-3 ml-1" />
                                    تغيير الرقم
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
                                    onClick={() => openSmsDialog(cheque)}
                                  >
                                    <MessageSquare className="h-3 w-3 ml-1" />
                                    SMS
                                  </Button>
                                </>
                              )}
                              {cheque.cheque_status !== 'cashed' && cheque.cheque_status !== 'returned' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-green-500/50 text-green-600 hover:bg-green-500/10"
                                  onClick={() => handleStatusChange(cheque.id, 'cashed')}
                                >
                                  <CheckCircle2 className="h-3 w-3 ml-1" />
                                  صرف
                                </Button>
                              )}
                              {cheque.cheque_status !== 'returned' && cheque.cheque_status !== 'cashed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleStatusChange(cheque.id, 'returned')}
                                >
                                  <RotateCcw className="h-3 w-3 ml-1" />
                                  مرتجع
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

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
                <p className="text-sm text-muted-foreground">عرض {cheques.length} من {totalCount} شيك</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">صفحة {currentPage} من {totalPages || 1}</span>
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Image Gallery Dialog */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="sm:max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>صور الشيك</DialogTitle>
          </DialogHeader>
          <div className="relative">
            {galleryImages[galleryIndex] && (
              <img src={galleryImages[galleryIndex]} alt={`صورة ${galleryIndex + 1}`} className="w-full h-auto max-h-[70vh] object-contain rounded-lg" />
            )}
            {galleryImages.length > 1 && (
              <>
                <Button variant="outline" size="icon" className="absolute left-2 top-1/2 -translate-y-1/2" onClick={() => setGalleryIndex((i) => (i + 1) % galleryImages.length)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  {galleryIndex + 1} / {galleryImages.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Cheque Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل رقم الشيك</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              الشيك الحالي: {editingCheque?.cheque_number || "غير محدد"}
            </p>
            <div className="space-y-2">
              <Label>رقم الشيك الجديد</Label>
              <Input
                value={editChequeNumber}
                onChange={(e) => setEditChequeNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="أدخل رقم الشيك الجديد"
                dir="ltr"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              ملاحظة: سيتم إعادة حالة الشيك إلى "قيد الانتظار" بعد تغيير الرقم
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveEditedCheque}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال رسالة للعميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={smsCheque?.policy?.client?.phone_number || "لا يوجد رقم"} disabled dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>نص الرسالة</Label>
              <textarea
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                className="w-full min-h-[100px] p-3 border rounded-md text-sm"
                dir="rtl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsDialogOpen(false)}>إلغاء</Button>
            <Button onClick={sendReturnedChequeSms} disabled={sendingSms || !smsCheque?.policy?.client?.phone_number}>
              {sendingSms ? "جاري الإرسال..." : "إرسال SMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
