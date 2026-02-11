import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { 
  Plus, 
  Receipt,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Search,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Banknote,
  CreditCard,
  Building,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ar } from "date-fns/locale";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";

interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  voucher_type: string;
  payment_method: string;
  reference_number: string | null;
  contact_name: string | null;
}

// Payment categories
const paymentCategories: Record<string, string> = {
  rent: 'إيجار المكتب',
  salaries: 'معاشات الموظفين',
  food: 'طعام المكتب',
  utilities: 'فواتير (كهرباء/ماء/إنترنت)',
  insurance_company: 'دفع لشركة تأمين',
  other: 'مصاريف أخرى',
};

// Receipt categories
const receiptCategories: Record<string, string> = {
  insurance_premium: 'قسط تأمين',
  commission: 'عمولة',
  debt_collection: 'تحصيل دين',
  other_income: 'إيرادات أخرى',
};

const paymentMethodLabels: Record<string, { label: string; icon: any }> = {
  cash: { label: 'نقدي', icon: Banknote },
  cheque: { label: 'شيك', icon: FileText },
  bank_transfer: { label: 'تحويل بنكي', icon: Building },
  visa: { label: 'فيزا', icon: CreditCard },
};

export default function Expenses() {
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  
  // Summary
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  
  // Filters
  const [voucherFilter, setVoucherFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({
    voucher_type: 'payment' as 'payment' | 'receipt',
    category: 'other',
    description: '',
    amount: '',
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    payment_method: 'cash',
    reference_number: '',
    contact_name: '',
  });
  const [saving, setSaving] = useState(false);
  
  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
      
      let query = supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .order('expense_date', { ascending: false });
      
      if (voucherFilter !== 'all') {
        query = query.eq('voucher_type', voucherFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }
      if (paymentMethodFilter !== 'all') {
        query = query.eq('payment_method', paymentMethodFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      let filtered = data || [];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(e => 
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (e.contact_name && e.contact_name.toLowerCase().includes(q))
        );
      }
      
      setExpenses(filtered);
      
      // Calculate totals from ALL data for the month (not filtered)
      const { data: allData } = await supabase
        .from('expenses')
        .select('amount, voucher_type')
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd);
      
      let receipts = 0, payments = 0;
      (allData || []).forEach(e => {
        if (e.voucher_type === 'receipt') receipts += Number(e.amount);
        else payments += Number(e.amount);
      });
      setTotalReceipts(receipts);
      setTotalPayments(payments);
      
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('حدث خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, voucherFilter, categoryFilter, paymentMethodFilter, searchQuery]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleSubmit = async () => {
    if (!formData.category || !formData.amount || !formData.expense_date) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    
    setSaving(true);
    try {
      const expenseData: any = {
        category: formData.category,
        description: formData.description || null,
        amount: parseFloat(formData.amount),
        expense_date: formData.expense_date,
        notes: formData.notes || null,
        created_by_admin_id: profile?.id,
        voucher_type: formData.voucher_type,
        payment_method: formData.payment_method,
        reference_number: formData.reference_number || null,
        contact_name: formData.contact_name || null,
      };
      
      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id);
        if (error) throw error;
        toast.success('تم تحديث السند');
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert(expenseData);
        if (error) throw error;
        toast.success(formData.voucher_type === 'receipt' ? 'تم إضافة سند القبض' : 'تم إضافة سند الصرف');
      }
      
      setIsDialogOpen(false);
      setEditingExpense(null);
      resetForm();
      fetchExpenses();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('حدث خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      voucher_type: 'payment',
      category: 'other',
      description: '',
      amount: '',
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
      payment_method: 'cash',
      reference_number: '',
      contact_name: '',
    });
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      voucher_type: (expense.voucher_type || 'payment') as 'payment' | 'receipt',
      category: expense.category,
      description: expense.description || '',
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      notes: expense.notes || '',
      payment_method: expense.payment_method || 'cash',
      reference_number: expense.reference_number || '',
      contact_name: expense.contact_name || '',
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', deletingId);
      if (error) throw error;
      toast.success('تم حذف السند');
      setDeleteDialogOpen(false);
      setDeletingId(null);
      fetchExpenses();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('حدث خطأ في الحذف');
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = (amount: number) => `₪${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB');
  const prevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const nextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));

  const currentCategories = formData.voucher_type === 'receipt' ? receiptCategories : paymentCategories;
  const allCategories = { ...paymentCategories, ...receiptCategories };
  const netMonth = totalReceipts - totalPayments;

  return (
    <MainLayout>
      <Header 
        title="سندات القبض والصرف" 
        subtitle="إدارة الحركات المالية"
        action={{
          label: "سند جديد",
          onClick: () => {
            setEditingExpense(null);
            resetForm();
            setIsDialogOpen(true);
          },
        }}
      />

      <div className="p-6 space-y-6">
        {/* Month Navigation */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h3 className="text-xl font-bold">
                {format(selectedMonth, 'MMMM yyyy', { locale: ar })}
              </h3>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-success">
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-success/10">
                  <ArrowDownRight className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي سندات القبض</p>
                  <p className="text-2xl font-bold text-success">{formatCurrency(totalReceipts)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-destructive">
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-destructive/10">
                  <ArrowUpRight className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي سندات الصرف</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(totalPayments)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-primary">
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">صافي الشهر</p>
                  <p className={`text-2xl font-bold ${netMonth >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {netMonth >= 0 ? '+' : ''}{formatCurrency(netMonth)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col gap-4">
              {/* Tabs */}
              <Tabs value={voucherFilter} onValueChange={setVoucherFilter} dir="rtl">
                <TabsList className="w-full md:w-auto">
                  <TabsTrigger value="all">الكل</TabsTrigger>
                  <TabsTrigger value="receipt">سند قبض</TabsTrigger>
                  <TabsTrigger value="payment">سند صرف</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث في الوصف / الملاحظات / الجهة..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
                
                {/* Category filter */}
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل التصنيفات</SelectItem>
                    {Object.entries(allCategories).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Payment method filter */}
                <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="طريقة الدفع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الطرق</SelectItem>
                    {Object.entries(paymentMethodLabels).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              سجل السندات
            </CardTitle>
            <CardDescription>
              {expenses.length} سند لشهر {format(selectedMonth, 'MMMM yyyy', { locale: ar })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>لا توجد سندات لهذا الشهر</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>نوع السند</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>التصنيف</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead>الجهة</TableHead>
                      <TableHead>طريقة الدفع</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>رقم مرجعي</TableHead>
                      <TableHead className="w-[100px]">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => {
                      const isReceipt = expense.voucher_type === 'receipt';
                      const catLabel = allCategories[expense.category] || expense.category;
                      const pm = paymentMethodLabels[expense.payment_method] || paymentMethodLabels.cash;
                      const PmIcon = pm.icon;
                      return (
                        <TableRow key={expense.id}>
                          <TableCell>
                            <Badge className={isReceipt 
                              ? 'bg-success/10 text-success border-success/20 hover:bg-success/20' 
                              : 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20'
                            }>
                              {isReceipt ? (
                                <><ArrowDownRight className="h-3 w-3 ml-1" />سند قبض</>
                              ) : (
                                <><ArrowUpRight className="h-3 w-3 ml-1" />سند صرف</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(expense.expense_date)}</TableCell>
                          <TableCell className="text-sm">{catLabel}</TableCell>
                          <TableCell className="text-sm">{expense.description || '-'}</TableCell>
                          <TableCell className="text-sm">{expense.contact_name || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <PmIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              {pm.label}
                            </div>
                          </TableCell>
                          <TableCell className={`font-bold ${isReceipt ? 'text-success' : 'text-destructive'}`}>
                            {isReceipt ? '+' : '-'}{formatCurrency(expense.amount)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {expense.reference_number || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(expense)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(expense.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? 'تعديل السند' : 'سند جديد'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Voucher Type Selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, voucher_type: 'receipt', category: 'insurance_premium' }))}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  formData.voucher_type === 'receipt'
                    ? 'border-success bg-success/5 ring-2 ring-success/20'
                    : 'border-border hover:border-success/40'
                }`}
              >
                <ArrowDownRight className={`h-6 w-6 mx-auto mb-1 ${formData.voucher_type === 'receipt' ? 'text-success' : 'text-muted-foreground'}`} />
                <p className={`font-bold ${formData.voucher_type === 'receipt' ? 'text-success' : ''}`}>سند قبض</p>
                <p className="text-xs text-muted-foreground">مبلغ داخل</p>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, voucher_type: 'payment', category: 'other' }))}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  formData.voucher_type === 'payment'
                    ? 'border-destructive bg-destructive/5 ring-2 ring-destructive/20'
                    : 'border-border hover:border-destructive/40'
                }`}
              >
                <ArrowUpRight className={`h-6 w-6 mx-auto mb-1 ${formData.voucher_type === 'payment' ? 'text-destructive' : 'text-muted-foreground'}`} />
                <p className={`font-bold ${formData.voucher_type === 'payment' ? 'text-destructive' : ''}`}>سند صرف</p>
                <p className="text-xs text-muted-foreground">مبلغ خارج</p>
              </button>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>التصنيف *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(currentCategories).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact name */}
            <div className="space-y-2">
              <Label>اسم الجهة</Label>
              <Input
                value={formData.contact_name}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                placeholder={formData.voucher_type === 'receipt' ? 'من دفع؟' : 'لمن دفعت؟'}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="وصف السند"
              />
            </div>

            {/* Amount + Date + Payment Method */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>المبلغ *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>التاريخ *</Label>
                <ArabicDatePicker
                  value={formData.expense_date}
                  onChange={(date) => setFormData(prev => ({ ...prev, expense_date: date }))}
                />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(paymentMethodLabels).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Reference number */}
            <div className="space-y-2">
              <Label>رقم مرجعي (اختياري)</Label>
              <Input
                value={formData.reference_number}
                onChange={(e) => setFormData(prev => ({ ...prev, reference_number: e.target.value }))}
                placeholder="رقم الشيك أو الحوالة..."
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">إلغاء</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'جاري الحفظ...' : editingExpense ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="حذف السند"
        description="هل أنت متأكد من حذف هذا السند؟ لا يمكن التراجع عن هذا الإجراء."
        loading={deleting}
      />
    </MainLayout>
  );
}
