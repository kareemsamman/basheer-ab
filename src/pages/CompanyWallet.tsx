import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { FileUploader } from "@/components/media/FileUploader";
import { 
  ArrowLeft, 
  Plus, 
  Wallet, 
  Calendar,
  CreditCard,
  Banknote,
  Building2,
  Receipt,
  XCircle,
  Loader2,
  Trash2,
  Split,
  TrendingDown,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { cn } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
  name_ar: string | null;
}

interface Settlement {
  id: string;
  total_amount: number;
  settlement_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  payment_type: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  bank_reference: string | null;
  refused: boolean;
}

type PaymentType = 'cash' | 'cheque' | 'bank_transfer' | 'visa';

interface PaymentLine {
  id: string;
  payment_type: PaymentType;
  amount: number;
  payment_date: string;
  cheque_number?: string;
  cheque_image_url?: string;
  bank_reference?: string;
  notes?: string;
}

const paymentTypeLabels: Record<PaymentType, string> = {
  cash: 'نقداً',
  cheque: 'شيك',
  bank_transfer: 'تحويل بنكي',
  visa: 'بطاقة ائتمان',
};

const PaymentTypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'cash': return <Banknote className="h-4 w-4" />;
    case 'cheque': return <Receipt className="h-4 w-4" />;
    case 'bank_transfer': return <Building2 className="h-4 w-4" />;
    case 'visa': return <CreditCard className="h-4 w-4" />;
    default: return <Wallet className="h-4 w-4" />;
  }
};

export default function CompanyWallet() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Wallet summary
  const [totalPayable, setTotalPayable] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [outstanding, setOutstanding] = useState(0);

  // Payment lines
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);

  // Split popover
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitAmount, setSplitAmount] = useState('');

  const fetchCompanyData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Fetch company info
      const { data: companyData, error: companyError } = await supabase
        .from('insurance_companies')
        .select('id, name, name_ar')
        .eq('id', companyId)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

      // Fetch settlements
      const { data: settlementsData } = await supabase
        .from('company_settlements')
        .select('*')
        .eq('company_id', companyId)
        .order('settlement_date', { ascending: false });

      if (settlementsData) {
        setSettlements(settlementsData as Settlement[]);
      }

      // Calculate wallet balance from ledger
      const { data: balanceData } = await supabase
        .rpc('get_company_wallet_balance', { p_company_id: companyId });

      if (balanceData && balanceData.length > 0) {
        setTotalPayable(Number(balanceData[0].total_payable) || 0);
        setTotalPaid(Number(balanceData[0].total_paid) || 0);
        setOutstanding(Number(balanceData[0].outstanding) || 0);
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات الشركة",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    fetchCompanyData();
  }, [fetchCompanyData]);

  const validateChequeNumber = (num: string) => /^\d{8}$/.test(num);

  const addPaymentLine = () => {
    setPaymentLines([
      ...paymentLines,
      {
        id: crypto.randomUUID(),
        payment_type: 'cash',
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
      },
    ]);
  };

  const removePaymentLine = (id: string) => {
    setPaymentLines(paymentLines.filter(p => p.id !== id));
  };

  const updatePaymentLine = (id: string, field: string, value: any) => {
    setPaymentLines(paymentLines.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSplitPayments = () => {
    if (splitCount < 2 || splitCount > 12 || !splitAmount) return;
    
    const totalAmount = parseFloat(splitAmount) || 0;
    if (totalAmount <= 0) return;

    const amountPerInstallment = Math.floor(totalAmount / splitCount);
    const remainder = totalAmount - (amountPerInstallment * splitCount);
    
    const today = new Date();
    const newPayments: PaymentLine[] = [];
    
    for (let i = 0; i < splitCount; i++) {
      const paymentDate = new Date(today);
      paymentDate.setMonth(today.getMonth() + i);
      
      const amount = i === 0 ? amountPerInstallment + remainder : amountPerInstallment;
      
      newPayments.push({
        id: crypto.randomUUID(),
        payment_type: 'cash',
        amount,
        payment_date: paymentDate.toISOString().split('T')[0],
      });
    }
    
    setPaymentLines(newPayments);
    setSplitPopoverOpen(false);
  };

  const handleSaveAllPayments = async () => {
    // Validate
    const hasInvalidCheque = paymentLines.some(
      p => p.payment_type === 'cheque' && !validateChequeNumber(p.cheque_number || '')
    );
    if (hasInvalidCheque) {
      toast({ title: "خطأ", description: "رقم الشيك يجب أن يكون 8 أرقام", variant: "destructive" });
      return;
    }

    const paymentsToSave = paymentLines.filter(p => p.amount > 0);

    if (paymentsToSave.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد دفعات لحفظها", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      for (const payment of paymentsToSave) {
        const { error } = await supabase
          .from('company_settlements')
          .insert({
            company_id: companyId,
            total_amount: payment.amount,
            settlement_date: payment.payment_date,
            notes: payment.notes || null,
            status: 'completed',
            created_by_admin_id: user?.id,
            payment_type: payment.payment_type,
            cheque_number: payment.payment_type === 'cheque' ? payment.cheque_number : null,
            cheque_image_url: payment.payment_type === 'cheque' ? payment.cheque_image_url : null,
            bank_reference: payment.payment_type === 'bank_transfer' ? payment.bank_reference : null,
            refused: false,
            branch_id: null,
          });

        if (error) throw error;
      }

      toast({ title: "تم الحفظ", description: "تم تسجيل جميع الدفعات بنجاح" });
      setShowNewPayment(false);
      setPaymentLines([]);
      fetchCompanyData();
    } catch (error) {
      console.error('Error saving payments:', error);
      toast({ title: "خطأ", description: "فشل في حفظ الدفعات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRefused = async (settlement: Settlement) => {
    try {
      const { error } = await supabase
        .from('company_settlements')
        .update({ refused: !settlement.refused })
        .eq('id', settlement.id);

      if (error) throw error;
      
      toast({ 
        title: settlement.refused ? "تم استعادة الدفعة" : "تم رفض الدفعة",
      });
      
      fetchCompanyData();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث الدفعة", variant: "destructive" });
    }
  };

  const totalPaymentLines = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 space-y-6" dir="rtl">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/companies')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6" />
                محفظة الشركة
              </h1>
              <p className="text-muted-foreground">{company?.name_ar || company?.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowNewPayment(true)} className="gap-2" size="lg">
            <Plus className="h-5 w-5" />
            دفعة جديدة للشركة
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* إجمالي المستحق للشركة */}
          <Card className="p-4 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                <TrendingDown className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي المستحق للشركة</p>
                <p className="text-lg font-bold text-orange-600">₪{totalPayable.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          {/* إجمالي المدفوع */}
          <Card className="p-4 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
                <p className="text-lg font-bold text-green-600">₪{totalPaid.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          {/* المتبقي */}
          <Card className={cn(
            "p-4",
            outstanding > 0 ? "border-red-200 dark:border-red-800" : "border-green-200 dark:border-green-800"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-xl",
                outstanding > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"
              )}>
                <Wallet className={cn(
                  "h-5 w-5",
                  outstanding > 0 ? "text-red-600" : "text-green-600"
                )} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المتبقي للشركة</p>
                <p className={cn(
                  "text-lg font-bold",
                  outstanding > 0 ? "text-red-600" : "text-green-600"
                )}>
                  ₪{outstanding.toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Settlements Table */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">سجل الدفعات</h2>
          {settlements.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد دفعات مسجلة</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead>رقم الشيك/المرجع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id} className={s.refused ? "opacity-50 line-through" : ""}>
                    <TableCell>{new Date(s.settlement_date).toLocaleDateString('ar-EG')}</TableCell>
                    <TableCell className="font-bold">₪{s.total_amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PaymentTypeIcon type={s.payment_type} />
                        {paymentTypeLabels[s.payment_type as PaymentType] || s.payment_type}
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.cheque_number || s.bank_reference || '-'}
                    </TableCell>
                    <TableCell>
                      {s.refused ? (
                        <Badge variant="destructive">مرفوض</Badge>
                      ) : (
                        <Badge variant="default">تم الدفع</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{s.notes || '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleRefused(s)}
                      >
                        {s.refused ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* New Payment Dialog */}
        <Dialog open={showNewPayment} onOpenChange={setShowNewPayment}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                دفعة جديدة للشركة
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Split Payments */}
              <div className="flex items-center gap-4">
                <Popover open={splitPopoverOpen} onOpenChange={setSplitPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Split className="h-4 w-4" />
                      تقسيم لدفعات
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>المبلغ الإجمالي</Label>
                        <Input
                          type="number"
                          value={splitAmount}
                          onChange={(e) => setSplitAmount(e.target.value)}
                          placeholder="0"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>عدد الدفعات</Label>
                        <Input
                          type="number"
                          min={2}
                          max={12}
                          value={splitCount}
                          onChange={(e) => setSplitCount(parseInt(e.target.value) || 2)}
                          dir="ltr"
                        />
                      </div>
                      <Button onClick={handleSplitPayments} className="w-full">
                        تقسيم
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button variant="outline" onClick={addPaymentLine} className="gap-2">
                  <Plus className="h-4 w-4" />
                  إضافة دفعة
                </Button>
              </div>

              {/* Payment Lines */}
              {paymentLines.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  أضف دفعة واحدة على الأقل
                </p>
              ) : (
                <div className="space-y-4">
                  {paymentLines.map((payment, index) => (
                    <Card key={payment.id} className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">دفعة {index + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePaymentLine(payment.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>المبلغ</Label>
                          <Input
                            type="number"
                            value={payment.amount || ''}
                            onChange={(e) => updatePaymentLine(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            dir="ltr"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>التاريخ</Label>
                          <ArabicDatePicker
                            value={payment.payment_date}
                            onChange={(date) => updatePaymentLine(payment.id, 'payment_date', date)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>طريقة الدفع</Label>
                          <Select
                            value={payment.payment_type}
                            onValueChange={(v) => updatePaymentLine(payment.id, 'payment_type', v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">نقداً</SelectItem>
                              <SelectItem value="cheque">شيك</SelectItem>
                              <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                              <SelectItem value="visa">بطاقة ائتمان</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Conditional fields */}
                      {payment.payment_type === 'cheque' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>رقم الشيك (8 أرقام)</Label>
                            <Input
                              value={payment.cheque_number || ''}
                              onChange={(e) => updatePaymentLine(payment.id, 'cheque_number', e.target.value)}
                              placeholder="12345678"
                              maxLength={8}
                              dir="ltr"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>صورة الشيك</Label>
                            <FileUploader
                              entityType="company_settlement_cheque"
                              entityId={payment.id}
                              onUploadComplete={(urls) => updatePaymentLine(payment.id, 'cheque_image_url', urls[0])}
                              accept="image/*"
                            />
                          </div>
                        </div>
                      )}

                      {payment.payment_type === 'bank_transfer' && (
                        <div className="space-y-2">
                          <Label>رقم المرجع البنكي</Label>
                          <Input
                            value={payment.bank_reference || ''}
                            onChange={(e) => updatePaymentLine(payment.id, 'bank_reference', e.target.value)}
                            placeholder="رقم الحوالة"
                            dir="ltr"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>ملاحظات</Label>
                        <Textarea
                          value={payment.notes || ''}
                          onChange={(e) => updatePaymentLine(payment.id, 'notes', e.target.value)}
                          placeholder="ملاحظات إضافية..."
                          rows={2}
                        />
                      </div>
                    </Card>
                  ))}

                  {/* Total */}
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <span className="font-semibold">إجمالي الدفعات:</span>
                    <span className="text-xl font-bold">₪{totalPaymentLines.toLocaleString()}</span>
                  </div>

                  {/* Save Button */}
                  <Button
                    onClick={handleSaveAllPayments}
                    disabled={saving || paymentLines.length === 0}
                    className="w-full"
                    size="lg"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        جاري الحفظ...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 ml-2" />
                        حفظ جميع الدفعات
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
