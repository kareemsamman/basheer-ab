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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { 
  Plus, 
  Receipt,
  Building,
  Users,
  Coffee,
  Zap,
  MoreHorizontal,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ar } from "date-fns/locale";

interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
}

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  rent: { label: 'إيجار المكتب', icon: Building, color: 'bg-blue-100 text-blue-700' },
  salaries: { label: 'معاشات الموظفين', icon: Users, color: 'bg-green-100 text-green-700' },
  food: { label: 'طعام المكتب', icon: Coffee, color: 'bg-orange-100 text-orange-700' },
  utilities: { label: 'فواتير', icon: Zap, color: 'bg-purple-100 text-purple-700' },
  other: { label: 'مصاريف أخرى', icon: MoreHorizontal, color: 'bg-gray-100 text-gray-700' },
};

export default function Expenses() {
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthTotal, setMonthTotal] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<Record<string, number>>({});
  
  // Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({
    category: 'other',
    description: '',
    amount: '',
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
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
      
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .order('expense_date', { ascending: false });
      
      if (error) throw error;
      
      setExpenses(data || []);
      
      // Calculate totals
      const total = (data || []).reduce((sum, e) => sum + Number(e.amount), 0);
      setMonthTotal(total);
      
      // Calculate category totals
      const catTotals: Record<string, number> = {};
      (data || []).forEach(e => {
        catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount);
      });
      setCategoryTotals(catTotals);
      
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('حدث خطأ في جلب المصاريف');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

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
      const expenseData = {
        category: formData.category,
        description: formData.description || null,
        amount: parseFloat(formData.amount),
        expense_date: formData.expense_date,
        notes: formData.notes || null,
        created_by_admin_id: profile?.id,
      };
      
      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id);
        
        if (error) throw error;
        toast.success('تم تحديث المصروف');
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert(expenseData);
        
        if (error) throw error;
        toast.success('تم إضافة المصروف');
      }
      
      setIsDialogOpen(false);
      setEditingExpense(null);
      setFormData({
        category: 'other',
        description: '',
        amount: '',
        expense_date: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
      });
      fetchExpenses();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('حدث خطأ في حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      category: expense.category,
      description: expense.description || '',
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      notes: expense.notes || '',
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
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', deletingId);
      
      if (error) throw error;
      toast.success('تم حذف المصروف');
      setDeleteDialogOpen(false);
      setDeletingId(null);
      fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('حدث خطأ في حذف المصروف');
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₪${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const prevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const nextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));

  return (
    <MainLayout>
      <Header 
        title="المصاريف" 
        subtitle="إدارة مصاريف المكتب"
        action={{
          label: "إضافة مصروف",
          onClick: () => {
            setEditingExpense(null);
            setFormData({
              category: 'other',
              description: '',
              amount: '',
              expense_date: format(new Date(), 'yyyy-MM-dd'),
              notes: '',
            });
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
              <div className="text-center">
                <h3 className="text-xl font-bold">
                  {format(selectedMonth, 'MMMM yyyy', { locale: ar })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  إجمالي المصاريف: <span className="font-bold text-destructive">{formatCurrency(monthTotal)}</span>
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Category Summary */}
        <div className="grid gap-4 md:grid-cols-5">
          {Object.entries(categoryLabels).map(([key, { label, icon: Icon, color }]) => (
            <Card key={key} className="border-l-4" style={{ borderColor: color.includes('blue') ? '#3b82f6' : color.includes('green') ? '#22c55e' : color.includes('orange') ? '#f97316' : color.includes('purple') ? '#a855f7' : '#6b7280' }}>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-2 rounded-lg ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <p className="text-lg font-bold">
                  {formatCurrency(categoryTotals[key] || 0)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Expenses Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              سجل المصاريف
            </CardTitle>
            <CardDescription>
              جميع المصاريف لشهر {format(selectedMonth, 'MMMM yyyy', { locale: ar })}
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
                <Receipt className="h-12 w-12 mx-auto mb-2" />
                <p>لا توجد مصاريف لهذا الشهر</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الوصف</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    <TableHead className="w-[100px]">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => {
                    const cat = categoryLabels[expense.category] || categoryLabels.other;
                    const Icon = cat.icon;
                    return (
                      <TableRow key={expense.id}>
                        <TableCell>{formatDate(expense.expense_date)}</TableCell>
                        <TableCell>
                          <Badge className={cat.color}>
                            <Icon className="h-3 w-3 ml-1" />
                            {cat.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{expense.description || '-'}</TableCell>
                        <TableCell className="font-bold text-destructive">
                          {formatCurrency(expense.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {expense.notes || '-'}
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>نوع المصروف *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الوصف</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="وصف المصروف"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبلغ *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>التاريخ *</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expense_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات إضافية..."
                rows={3}
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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="حذف المصروف"
        description="هل أنت متأكد من حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء."
        loading={deleting}
      />
    </MainLayout>
  );
}
