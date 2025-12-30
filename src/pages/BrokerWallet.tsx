import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileUploader } from "@/components/media/FileUploader";
import { BrokerPaymentModal } from "@/components/brokers/BrokerPaymentModal";
import { 
  ArrowLeft, 
  Plus, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  Banknote,
  Building2,
  Receipt,
  XCircle,
  Image,
  Loader2,
  Trash2,
  Split,
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

interface Broker {
  id: string;
  name: string;
  phone: string | null;
}

interface Transaction {
  id: string;
  direction: 'we_owe' | 'broker_owes';
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
  card_last_four: string | null;
  installments_count: number | null;
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
  tranzila_paid?: boolean;
}

const paymentTypeLabels: Record<PaymentType, string> = {
  cash: 'نقداً',
  cheque: 'شيك',
  bank_transfer: 'تحويل بنكي',
  visa: 'بطاقة ائتمان',
};

const PAYMENT_TYPES = [
  { value: 'cash', label: 'نقداً' },
  { value: 'cheque', label: 'شيك' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'visa', label: 'بطاقة ائتمان' },
];

const PaymentTypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'cash': return <Banknote className="h-4 w-4" />;
    case 'cheque': return <Receipt className="h-4 w-4" />;
    case 'bank_transfer': return <Building2 className="h-4 w-4" />;
    case 'visa': return <CreditCard className="h-4 w-4" />;
    default: return <Wallet className="h-4 w-4" />;
  }
};

export default function BrokerWallet() {
  const { brokerId } = useParams<{ brokerId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [broker, setBroker] = useState<Broker | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTransaction, setShowNewTransaction] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Wallet summary
  const [paidToBroker, setPaidToBroker] = useState(0);
  const [receivedFromBroker, setReceivedFromBroker] = useState(0);

  // New transaction form - direction selection
  const [direction, setDirection] = useState<'we_owe' | 'broker_owes'>('broker_owes');

  // Payment lines (like Step4)
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);

  // Split popover
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitAmount, setSplitAmount] = useState('');

  // Tranzila modal
  const [showTranzilaModal, setShowTranzilaModal] = useState(false);
  const [selectedVisaPaymentIndex, setSelectedVisaPaymentIndex] = useState<number | null>(null);

  useEffect(() => {
    if (brokerId) {
      fetchBrokerData();
    }
  }, [brokerId]);

  const fetchBrokerData = async () => {
    setLoading(true);
    try {
      const { data: brokerData, error: brokerError } = await supabase
        .from('brokers')
        .select('id, name, phone')
        .eq('id', brokerId)
        .single();

      if (brokerError) throw brokerError;
      setBroker(brokerData);

      const { data: transactionsData } = await supabase
        .from('broker_settlements')
        .select('*')
        .eq('broker_id', brokerId)
        .order('settlement_date', { ascending: false });

      if (transactionsData) {
        setTransactions(transactionsData as Transaction[]);
        
        const paid = transactionsData
          .filter((t: any) => t.direction === 'we_owe' && !t.refused && t.status === 'completed')
          .reduce((sum: number, t: any) => sum + (t.total_amount || 0), 0);
        const received = transactionsData
          .filter((t: any) => t.direction === 'broker_owes' && !t.refused && t.status === 'completed')
          .reduce((sum: number, t: any) => sum + (t.total_amount || 0), 0);
        
        setPaidToBroker(paid);
        setReceivedFromBroker(received);
      }
    } catch (error) {
      console.error('Error fetching broker data:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات الوسيط",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

  const handleVisaPayClick = (index: number) => {
    const payment = paymentLines[index];
    if (!payment || (payment.amount || 0) <= 0) return;
    
    setSelectedVisaPaymentIndex(index);
    setShowTranzilaModal(true);
  };

  const handleVisaSuccess = () => {
    if (selectedVisaPaymentIndex !== null) {
      const payment = paymentLines[selectedVisaPaymentIndex];
      if (payment) {
        updatePaymentLine(payment.id, 'tranzila_paid', true);
      }
    }
    setShowTranzilaModal(false);
    setSelectedVisaPaymentIndex(null);
    // Refresh data
    fetchBrokerData();
  };

  const handleVisaFailure = () => {
    setShowTranzilaModal(false);
    setSelectedVisaPaymentIndex(null);
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

    // Filter out visa payments that weren't paid (they're handled separately)
    const paymentsToSave = paymentLines.filter(p => {
      if (p.payment_type === 'visa') {
        return p.tranzila_paid; // Only save visa if already paid via Tranzila
      }
      return p.amount > 0;
    });

    // Filter only non-visa payments to insert (visa already inserted by Tranzila flow)
    const nonVisaPayments = paymentsToSave.filter(p => p.payment_type !== 'visa');

    if (nonVisaPayments.length === 0 && !paymentLines.some(p => p.tranzila_paid)) {
      toast({ title: "تنبيه", description: "لا توجد دفعات لحفظها", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Insert non-visa payments
      for (const payment of nonVisaPayments) {
        const { error } = await supabase
          .from('broker_settlements')
          .insert({
            broker_id: brokerId,
            direction,
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
          });

        if (error) throw error;
      }

      toast({ title: "تم الحفظ", description: "تم تسجيل جميع الدفعات بنجاح" });
      setShowNewTransaction(false);
      resetForm();
      fetchBrokerData();
    } catch (error) {
      console.error('Error saving payments:', error);
      toast({ title: "خطأ", description: "فشل في حفظ الدفعات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRefused = async (transaction: Transaction) => {
    try {
      const { error } = await supabase
        .from('broker_settlements')
        .update({ refused: !transaction.refused })
        .eq('id', transaction.id);

      if (error) throw error;
      
      toast({ 
        title: transaction.refused ? "تم استعادة المعاملة" : "تم إلغاء المعاملة",
      });
      
      fetchBrokerData();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث المعاملة", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setDirection('broker_owes');
    setPaymentLines([]);
    setSplitAmount('');
  };

  const netBalance = receivedFromBroker - paidToBroker;
  const totalPaymentLines = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);

  const selectedVisaPayment = selectedVisaPaymentIndex !== null ? paymentLines[selectedVisaPaymentIndex] : null;

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
            <Button variant="ghost" size="icon" onClick={() => navigate('/brokers')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6" />
                محفظة الوسيط
              </h1>
              <p className="text-muted-foreground">{broker?.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowNewTransaction(true)} className="gap-2" size="lg">
            <Plus className="h-5 w-5" />
            دفعة جديدة
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
                <ArrowUpRight className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">دفعت للوسيط</p>
                <p className="text-2xl font-bold text-red-600">₪{paidToBroker.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                <ArrowDownLeft className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">استلمت من الوسيط</p>
                <p className="text-2xl font-bold text-green-600">₪{receivedFromBroker.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <Card className={cn(
            "p-6",
            netBalance >= 0 ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-3 rounded-xl",
                netBalance >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
              )}>
                <Wallet className={cn(
                  "h-6 w-6",
                  netBalance >= 0 ? 'text-green-600' : 'text-red-600'
                )} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {netBalance >= 0 ? 'الصافي (الوسيط مدين)' : 'الصافي (أنا مدين)'}
                </p>
                <p className={cn(
                  "text-2xl font-bold",
                  netBalance >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  ₪{Math.abs(netBalance).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card>
          <div className="p-4 border-b">
            <h2 className="font-semibold">سجل المعاملات</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الاتجاه</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead className="w-20">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      لا توجد معاملات بعد
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((transaction) => (
                    <TableRow key={transaction.id} className={cn(transaction.refused && "opacity-50")}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(transaction.settlement_date).toLocaleDateString('ar-EG')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {transaction.direction === 'we_owe' ? (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            <ArrowUpRight className="h-3 w-3 ml-1" />
                            دفعت للوسيط
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            <ArrowDownLeft className="h-3 w-3 ml-1" />
                            استلمت من الوسيط
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PaymentTypeIcon type={transaction.payment_type || 'cash'} />
                          <span>{paymentTypeLabels[(transaction.payment_type || 'cash') as PaymentType]}</span>
                          {transaction.cheque_number && (
                            <Badge variant="secondary" className="text-xs">
                              #{transaction.cheque_number}
                            </Badge>
                          )}
                          {transaction.card_last_four && (
                            <Badge variant="secondary" className="text-xs">
                              ****{transaction.card_last_four}
                            </Badge>
                          )}
                          {transaction.cheque_image_url && (
                            <a href={transaction.cheque_image_url} target="_blank" rel="noopener noreferrer">
                              <Image className="h-4 w-4 text-blue-500 cursor-pointer" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        ₪{transaction.total_amount.toLocaleString()}
                        {transaction.installments_count && transaction.installments_count > 1 && (
                          <span className="text-xs text-muted-foreground mr-1">
                            ({transaction.installments_count} تقسيطات)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {transaction.refused ? (
                          <Badge className="bg-red-100 text-red-700">
                            <XCircle className="h-3 w-3 ml-1" />
                            مرفوض
                          </Badge>
                        ) : transaction.status === 'completed' ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            مكتمل
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700">
                            قيد الانتظار
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {transaction.notes || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleRefused(transaction)}
                          className={cn(
                            "text-xs",
                            transaction.refused ? "text-green-600 hover:text-green-700" : "text-red-600 hover:text-red-700"
                          )}
                        >
                          {transaction.refused ? "استعادة" : "رفض"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* New Transaction Dialog - Step4 Style */}
        <Dialog open={showNewTransaction} onOpenChange={setShowNewTransaction}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                دفعة جديدة - {broker?.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Direction Selection */}
              <div>
                <Label className="mb-2 block">اتجاه الدفعة</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={direction === 'broker_owes' ? 'default' : 'outline'}
                    className={cn(
                      "h-16 flex-col gap-1",
                      direction === 'broker_owes' && "bg-green-600 hover:bg-green-700"
                    )}
                    onClick={() => setDirection('broker_owes')}
                  >
                    <ArrowDownLeft className="h-5 w-5" />
                    <span className="text-sm">استلمت من الوسيط</span>
                  </Button>
                  <Button
                    type="button"
                    variant={direction === 'we_owe' ? 'default' : 'outline'}
                    className={cn(
                      "h-16 flex-col gap-1",
                      direction === 'we_owe' && "bg-red-600 hover:bg-red-700"
                    )}
                    onClick={() => setDirection('we_owe')}
                  >
                    <ArrowUpRight className="h-5 w-5" />
                    <span className="text-sm">دفعت للوسيط</span>
                  </Button>
                </div>
              </div>

              {/* Payment Lines Header */}
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">الدفعات</Label>
                <div className="flex gap-2">
                  {/* Split Button */}
                  <Popover open={splitPopoverOpen} onOpenChange={setSplitPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="gap-2">
                        <Split className="h-4 w-4" />
                        تقسيط
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="end" dir="rtl">
                      <div className="space-y-4">
                        <h4 className="font-semibold text-sm">تقسيط المبلغ</h4>
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs">المبلغ الإجمالي</Label>
                            <Input
                              type="number"
                              value={splitAmount}
                              onChange={(e) => setSplitAmount(e.target.value)}
                              placeholder="0"
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">عدد الأقساط (2-12)</Label>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                min={2}
                                max={12}
                                value={splitCount}
                                onChange={(e) => setSplitCount(Math.min(12, Math.max(2, parseInt(e.target.value) || 2)))}
                                className="h-9"
                              />
                              <Button 
                                type="button" 
                                size="sm" 
                                onClick={handleSplitPayments}
                                className="h-9 px-4"
                              >
                                تقسيم
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Button type="button" variant="outline" size="sm" onClick={addPaymentLine} className="gap-2">
                    <Plus className="h-4 w-4" />
                    إضافة دفعة
                  </Button>
                </div>
              </div>

              {/* Payment Lines */}
              {paymentLines.length === 0 ? (
                <Card className="p-8 text-center bg-muted/30">
                  <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">لا توجد دفعات</p>
                  <p className="text-xs text-muted-foreground mt-1">يمكنك إضافة دفعات باستخدام الأزرار أعلاه</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {paymentLines.map((payment, index) => {
                    const isVisa = payment.payment_type === 'visa';
                    const visaPaid = payment.tranzila_paid;
                    
                    return (
                      <Card key={payment.id} className={cn(
                        "p-4",
                        visaPaid && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                      )}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                          {/* Payment Type */}
                          <div>
                            <Label className="text-xs mb-1.5 block">نوع الدفع</Label>
                            <Select
                              value={payment.payment_type}
                              onValueChange={(v) => updatePaymentLine(payment.id, 'payment_type', v)}
                              disabled={visaPaid}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Amount */}
                          <div>
                            <Label className="text-xs mb-1.5 block">المبلغ (₪)</Label>
                            <Input
                              type="number"
                              value={payment.amount || ''}
                              onChange={(e) => updatePaymentLine(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              disabled={visaPaid}
                              className="h-9"
                            />
                          </div>

                          {/* Date */}
                          <div>
                            <Label className="text-xs mb-1.5 block">التاريخ</Label>
                            <ArabicDatePicker
                              value={payment.payment_date}
                              onChange={(date) => updatePaymentLine(payment.id, 'payment_date', date)}
                              className="h-9"
                              disabled={visaPaid}
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {/* Cheque Number */}
                            {payment.payment_type === 'cheque' && (
                              <Input
                                value={payment.cheque_number || ''}
                                onChange={(e) => updatePaymentLine(payment.id, 'cheque_number', e.target.value.replace(/\D/g, '').slice(0, 8))}
                                placeholder="رقم الشيك"
                                maxLength={8}
                                className="h-9 flex-1 font-mono"
                              />
                            )}

                            {/* Bank Reference */}
                            {payment.payment_type === 'bank_transfer' && (
                              <Input
                                value={payment.bank_reference || ''}
                                onChange={(e) => updatePaymentLine(payment.id, 'bank_reference', e.target.value)}
                                placeholder="رقم التحويل"
                                className="h-9 flex-1"
                              />
                            )}
                            
                            {/* Visa Pay Button */}
                            {isVisa && !visaPaid && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleVisaPayClick(index)}
                                disabled={(payment.amount || 0) <= 0}
                                className="gap-1.5 bg-primary hover:bg-primary/90"
                              >
                                <CreditCard className="h-4 w-4" />
                                ادفع
                              </Button>
                            )}
                            
                            {/* Paid Badge */}
                            {isVisa && visaPaid && (
                              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                <CreditCard className="h-3.5 w-3.5" />
                                تم الدفع
                              </span>
                            )}
                            
                            {/* Delete Button */}
                            {!visaPaid && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removePaymentLine(payment.id)}
                                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Cheque Image Upload */}
                        {payment.payment_type === 'cheque' && !visaPaid && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <Label className="text-xs text-muted-foreground mb-2 block">صورة الشيك</Label>
                            <FileUploader
                              entityType="broker_cheque"
                              entityId={payment.id}
                              accept="image/*"
                              maxFiles={1}
                              onUploadComplete={(files) => {
                                if (files.length > 0) {
                                  updatePaymentLine(payment.id, 'cheque_image_url', files[0].cdn_url);
                                }
                              }}
                            />
                            {payment.cheque_image_url && (
                              <div className="mt-2">
                                <img 
                                  src={payment.cheque_image_url} 
                                  alt="صورة الشيك" 
                                  className="h-16 w-auto rounded border"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Total */}
              {paymentLines.length > 0 && (
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <span className="font-medium">إجمالي الدفعات:</span>
                  <span className="text-xl font-bold">₪{totalPaymentLines.toLocaleString()}</span>
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowNewTransaction(false)}>
                  إلغاء
                </Button>
                <Button 
                  onClick={handleSaveAllPayments} 
                  disabled={saving || paymentLines.length === 0}
                  className="gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ الدفعات
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tranzila Modal */}
        {selectedVisaPayment && (
          <BrokerPaymentModal
            open={showTranzilaModal}
            onOpenChange={setShowTranzilaModal}
            brokerId={brokerId || ''}
            amount={selectedVisaPayment.amount}
            direction={direction}
            settlementDate={selectedVisaPayment.payment_date}
            notes={selectedVisaPayment.notes}
            onSuccess={handleVisaSuccess}
            onFailure={handleVisaFailure}
          />
        )}
      </div>
    </MainLayout>
  );
}
