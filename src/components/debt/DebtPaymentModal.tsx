import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Loader2, CreditCard, Banknote, Wallet, AlertCircle, CheckCircle, DollarSign, Plus, Trash2, Split } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TranzilaPaymentModal } from '@/components/payments/TranzilaPaymentModal';
import { sanitizeChequeNumber, CHEQUE_NUMBER_MAX_LENGTH } from '@/lib/chequeUtils';

interface PolicyPaymentInfo {
  policyId: string;
  policyType: string;
  policyTypeChild: string | null;
  carNumber: string | null;
  price: number;
  paid: number;
  remaining: number;
  branchId: string | null;
}

interface PaymentLine {
  id: string;
  amount: number;
  paymentType: 'cash' | 'cheque' | 'transfer' | 'visa';
  paymentDate: string;
  chequeNumber?: string;
  notes?: string;
  tranzilaPaid?: boolean;
}

interface DebtPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  totalOwed: number;
  onSuccess: () => void;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
  HEALTH: 'تأمين صحي',
  LIFE: 'تأمين حياة',
  PROPERTY: 'تأمين ممتلكات',
  TRAVEL: 'تأمين سفر',
  BUSINESS: 'تأمين أعمال',
  OTHER: 'أخرى',
};

const paymentTypes = [
  { value: 'cash', label: 'نقدي', icon: Banknote },
  { value: 'cheque', label: 'شيك', icon: CreditCard },
  { value: 'transfer', label: 'تحويل', icon: Wallet },
  { value: 'visa', label: 'بطاقة ائتمان', icon: CreditCard },
];

export function DebtPaymentModal({
  open,
  onOpenChange,
  clientId,
  clientName,
  clientPhone,
  totalOwed,
  onSuccess,
}: DebtPaymentModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<PolicyPaymentInfo[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [tranzilaEnabled, setTranzilaEnabled] = useState(false);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  const [activeVisaPaymentIndex, setActiveVisaPaymentIndex] = useState<number | null>(null);
  const [activeTranzilaPolicyId, setActiveTranzilaPolicyId] = useState<string | null>(null);
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);

  const totalRemaining = policies.reduce((sum, p) => sum + p.remaining, 0);
  const totalPrice = policies.reduce((sum, p) => sum + p.price, 0);
  const totalPaid = policies.reduce((sum, p) => sum + p.paid, 0);
  const totalPaymentAmount = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);
  const isOverpaying = totalPaymentAmount > totalRemaining;
  
  // Check if all non-visa payments have valid data, and visa payments are either paid or have valid amount
  const isValid = paymentLines.length > 0 && 
    totalPaymentAmount > 0 && 
    totalPaymentAmount <= totalRemaining &&
    paymentLines.every(p => {
      if (p.paymentType === 'cheque' && !p.chequeNumber?.trim()) return false;
      if (p.paymentType === 'visa' && !p.tranzilaPaid && p.amount <= 0) return false;
      return p.amount > 0;
    });

  useEffect(() => {
    if (open && clientId) {
      fetchPolicyPaymentInfo();
      checkTranzilaEnabled();
      // Reset form with one empty payment line
      setPaymentLines([{
        id: crypto.randomUUID(),
        amount: 0,
        paymentType: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
      }]);
    }
  }, [open, clientId]);

  const checkTranzilaEnabled = async () => {
    const { data } = await supabase
      .from('payment_settings')
      .select('is_enabled')
      .eq('provider', 'tranzila')
      .single();
    setTranzilaEnabled(data?.is_enabled || false);
  };

  const fetchPolicyPaymentInfo = async () => {
    setLoading(true);
    try {
      // Fetch ALL unpaid policies for this client (including expired) - excluding ELZAMI
      // This matches the debt tracking page logic
      const { data: policiesData, error: policiesError } = await supabase
        .from('policies')
        .select('id, policy_type_parent, policy_type_child, insurance_price, branch_id, car:cars(car_number)')
        .eq('client_id', clientId)
        .eq('cancelled', false)
        .is('deleted_at', null)
        .neq('policy_type_parent', 'ELZAMI');

      if (policiesError) throw policiesError;

      const policyIds = (policiesData || []).map(p => p.id);

      if (policyIds.length === 0) {
        setPolicies([]);
        setLoading(false);
        return;
      }

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('policy_payments')
        .select('policy_id, amount, refused')
        .in('policy_id', policyIds);

      if (paymentsError) throw paymentsError;

      const policyPayments: Record<string, number> = {};
      (paymentsData || []).forEach(p => {
        if (!p.refused) {
          policyPayments[p.policy_id] = (policyPayments[p.policy_id] || 0) + p.amount;
        }
      });

      const policyInfo = (policiesData || [])
        .map(p => ({
          policyId: p.id,
          policyType: p.policy_type_parent,
          policyTypeChild: p.policy_type_child,
          carNumber: (p.car as any)?.car_number || null,
          price: p.insurance_price,
          paid: policyPayments[p.id] || 0,
          remaining: p.insurance_price - (policyPayments[p.id] || 0),
          branchId: p.branch_id,
        }))
        .filter(p => p.remaining > 0);

      setPolicies(policyInfo);
    } catch (error) {
      console.error('Error fetching policy payment info:', error);
      toast.error('خطأ في جلب بيانات الدفع');
    } finally {
      setLoading(false);
    }
  };

  const addPaymentLine = () => {
    setPaymentLines([
      ...paymentLines,
      {
        id: crypto.randomUUID(),
        amount: 0,
        paymentType: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
      },
    ]);
  };

  const removePaymentLine = (id: string) => {
    if (paymentLines.length > 1) {
      setPaymentLines(paymentLines.filter(p => p.id !== id));
    }
  };

  const updatePaymentLine = (id: string, field: keyof PaymentLine, value: any) => {
    setPaymentLines(paymentLines.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSplitPayments = () => {
    if (splitCount < 2 || splitCount > 12 || totalRemaining <= 0) return;
    
    const amountPerInstallment = Math.floor(totalRemaining / splitCount);
    const remainder = totalRemaining - (amountPerInstallment * splitCount);
    
    const today = new Date();
    const newPayments: PaymentLine[] = [];
    
    for (let i = 0; i < splitCount; i++) {
      const paymentDate = new Date(today);
      paymentDate.setMonth(today.getMonth() + i);
      
      const amount = i === 0 ? amountPerInstallment + remainder : amountPerInstallment;
      
      newPayments.push({
        id: crypto.randomUUID(),
        amount,
        paymentType: 'cash',
        paymentDate: paymentDate.toISOString().split('T')[0],
      });
    }
    
    setPaymentLines(newPayments);
    setSplitPopoverOpen(false);
  };

  const calculateSplitPayments = (amount: number) => {
    const splits: { policyId: string; amount: number; branchId: string | null }[] = [];
    
    if (amount <= 0 || totalRemaining <= 0) return splits;

    policies.forEach(policy => {
      if (policy.remaining > 0) {
        const proportion = policy.remaining / totalRemaining;
        const policyPayment = Math.min(amount * proportion, policy.remaining);
        if (policyPayment > 0) {
          splits.push({
            policyId: policy.policyId,
            amount: Math.round(policyPayment * 100) / 100,
            branchId: policy.branchId,
          });
        }
      }
    });

    const totalSplit = splits.reduce((sum, s) => sum + s.amount, 0);
    const diff = amount - totalSplit;
    if (splits.length > 0 && Math.abs(diff) > 0.001) {
      splits[0].amount = Math.round((splits[0].amount + diff) * 100) / 100;
    }

    return splits;
  };

  const handleVisaPayClick = (index: number) => {
    const payment = paymentLines[index];
    if (!payment || payment.amount <= 0) return;
    
    if (!tranzilaEnabled) {
      toast.error('الدفع بالبطاقة غير مفعل');
      return;
    }

    // Use first policy for Tranzila
    const firstPolicy = policies.find(p => p.remaining > 0);
    if (firstPolicy) {
      setActiveVisaPaymentIndex(index);
      setActiveTranzilaPolicyId(firstPolicy.policyId);
      setTranzilaModalOpen(true);
    }
  };

  const handleTranzilaSuccess = async () => {
    setTranzilaModalOpen(false);
    
    if (activeVisaPaymentIndex !== null) {
      updatePaymentLine(paymentLines[activeVisaPaymentIndex].id, 'tranzilaPaid', true);
    }
    
    setActiveVisaPaymentIndex(null);
    setActiveTranzilaPolicyId(null);
  };

  const sendPaymentConfirmationSms = async (paidAmount: number) => {
    if (!clientPhone) return;
    
    try {
      // Generate client report
      const { data: reportData, error: reportError } = await supabase.functions.invoke('generate-client-report', {
        body: { client_id: clientId }
      });
      
      if (reportError) {
        console.error('Error generating client report:', reportError);
        return;
      }
      
      const reportUrl = reportData?.report_url;
      
      // Send SMS with payment confirmation and report link
      const message = `مرحباً ${clientName}، تم استلام دفعة بمبلغ ₪${paidAmount.toLocaleString()}. شكراً لك!\n\nلعرض تقريرك الشامل:\n${reportUrl || 'غير متوفر'}`;
      
      await supabase.functions.invoke('send-sms', {
        body: {
          phone: clientPhone,
          message,
          sms_type: 'payment_confirmation'
        }
      });
      
      toast.success('تم إرسال رسالة التأكيد للعميل');
    } catch (error) {
      console.error('Error sending payment confirmation SMS:', error);
      // Don't throw - payment was successful, just SMS failed
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    // Check if there are unpaid visa payments
    const unpaidVisaPayments = paymentLines.filter(p => p.paymentType === 'visa' && !p.tranzilaPaid);
    if (unpaidVisaPayments.length > 0) {
      toast.error('يرجى إتمام الدفع بالبطاقة أولاً');
      return;
    }

    setSaving(true);
    try {
      // Process each non-visa payment line
      for (const paymentLine of paymentLines) {
        if (paymentLine.paymentType === 'visa' && paymentLine.tranzilaPaid) {
          // Visa already handled by Tranzila - create split payments for other policies
          const splits = calculateSplitPayments(paymentLine.amount);
          const otherSplits = splits.filter(s => s.policyId !== activeTranzilaPolicyId);
          
          if (otherSplits.length > 0) {
            const payments = otherSplits.map(split => ({
              policy_id: split.policyId,
              amount: split.amount,
              payment_type: 'visa' as const,
              payment_date: paymentLine.paymentDate,
              notes: paymentLine.notes || `تسديد دين`,
              branch_id: split.branchId,
            }));

            await supabase.from('policy_payments').insert(payments);
          }
        } else if (paymentLine.paymentType !== 'visa') {
          // Non-visa payment - split across policies
          const splits = calculateSplitPayments(paymentLine.amount);
          
          if (splits.length > 0) {
            const payments = splits.map(split => ({
              policy_id: split.policyId,
              amount: split.amount,
              payment_type: paymentLine.paymentType,
              payment_date: paymentLine.paymentDate,
              cheque_number: paymentLine.paymentType === 'cheque' ? paymentLine.chequeNumber : null,
              notes: paymentLine.notes || `تسديد دين`,
              branch_id: split.branchId,
            }));

            const { error } = await supabase.from('policy_payments').insert(payments);
            if (error) throw error;
          }
        }
      }

      toast.success('تم تسديد الدفعات بنجاح');
      
      // Send SMS confirmation with client report link
      await sendPaymentConfirmationSms(totalPaymentAmount);
      
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error saving payments:', error);
      toast.error(error.message || 'خطأ في حفظ الدفعات');
    } finally {
      setSaving(false);
    }
  };

  const getPolicyLabel = (policy: PolicyPaymentInfo) => {
    const parent = policyTypeLabels[policy.policyType] || policy.policyType;
    const child = policy.policyTypeChild === 'THIRD_FULL' ? 'شامل' : 
                  policy.policyTypeChild === 'THIRD_ONLY' ? 'طرف ثالث' : '';
    return child ? `${parent} - ${child}` : parent;
  };

  const activeVisaPayment = activeVisaPaymentIndex !== null ? paymentLines[activeVisaPaymentIndex] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            تسديد ديون {clientName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p>لا توجد ديون مستحقة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">إجمالي السعر</p>
                <p className="text-lg font-bold">₪{totalPrice.toLocaleString()}</p>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">المدفوع</p>
                <p className="text-lg font-bold text-green-600">₪{totalPaid.toLocaleString()}</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">المتبقي</p>
                <p className="text-lg font-bold text-destructive">₪{totalRemaining.toLocaleString()}</p>
              </div>
            </div>

            {/* Policy List */}
            <div className="border rounded-lg divide-y max-h-32 overflow-auto">
              {policies.map(policy => (
                <div key={policy.policyId} className="flex items-center justify-between p-2 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <Badge variant="outline" className="text-xs w-fit">
                      {getPolicyLabel(policy)}
                    </Badge>
                    {policy.carNumber && (
                      <span className="text-xs text-muted-foreground font-mono">{policy.carNumber}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">₪{policy.price.toLocaleString()}</span>
                    <span className="font-medium text-destructive">
                      -₪{policy.remaining.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">الدفعات</Label>
                <div className="flex items-center gap-2">
                  <Popover open={splitPopoverOpen} onOpenChange={setSplitPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Split className="h-4 w-4 ml-2" />
                        تقسيط
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60" align="end">
                      <div className="space-y-3">
                        <Label>عدد الأقساط</Label>
                        <Input
                          type="number"
                          min={2}
                          max={12}
                          value={splitCount}
                          onChange={e => setSplitCount(parseInt(e.target.value) || 2)}
                        />
                        <Button onClick={handleSplitPayments} className="w-full">
                          تقسيم إلى {splitCount} دفعات
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="sm" onClick={addPaymentLine}>
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة دفعة
                  </Button>
                </div>
              </div>

              {paymentLines.map((payment, index) => (
                <Card key={payment.id} className="p-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">دفعة {index + 1}</span>
                      {paymentLines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removePaymentLine(payment.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">المبلغ</Label>
                        <Input
                          type="number"
                          value={payment.amount || ''}
                          onChange={e => updatePaymentLine(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                          placeholder={`أقصى: ₪${totalRemaining.toLocaleString()}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">طريقة الدفع</Label>
                        <Select 
                          value={payment.paymentType} 
                          onValueChange={v => updatePaymentLine(payment.id, 'paymentType', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentTypes
                              .filter(pt => pt.value !== 'visa' || tranzilaEnabled)
                              .map(pt => (
                                <SelectItem key={pt.value} value={pt.value}>
                                  <span className="flex items-center gap-2">
                                    <pt.icon className="h-4 w-4" />
                                    {pt.label}
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">تاريخ الدفع</Label>
                        <Input
                          type="date"
                          value={payment.paymentDate}
                          onChange={e => updatePaymentLine(payment.id, 'paymentDate', e.target.value)}
                        />
                      </div>
                      {payment.paymentType === 'cheque' && (
                        <div>
                          <Label className="text-xs">رقم الشيك</Label>
                          <Input
                            value={payment.chequeNumber || ''}
                            onChange={e => updatePaymentLine(payment.id, 'chequeNumber', sanitizeChequeNumber(e.target.value))}
                            placeholder="رقم الشيك"
                            maxLength={CHEQUE_NUMBER_MAX_LENGTH}
                          />
                        </div>
                      )}
                    </div>

                    {/* Visa Pay Button */}
                    {payment.paymentType === 'visa' && (
                      <div className="flex items-center gap-2">
                        {payment.tranzilaPaid ? (
                          <Badge className="bg-green-500">
                            <CheckCircle className="h-3 w-3 ml-1" />
                            تم الدفع
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVisaPayClick(index)}
                            disabled={payment.amount <= 0}
                          >
                            <CreditCard className="h-4 w-4 ml-2" />
                            ادفع الآن
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Total and Validation */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="font-medium">مجموع الدفعات:</span>
              <span className={cn("text-lg font-bold", isOverpaying && "text-destructive")}>
                ₪{totalPaymentAmount.toLocaleString()}
              </span>
            </div>

            {isOverpaying && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                مجموع الدفعات أكبر من المبلغ المتبقي (₪{totalRemaining.toLocaleString()})
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || saving || policies.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            تسديد المبلغ
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Tranzila Payment Modal */}
      {activeTranzilaPolicyId && activeVisaPayment && (
        <TranzilaPaymentModal
          open={tranzilaModalOpen}
          onOpenChange={setTranzilaModalOpen}
          policyId={activeTranzilaPolicyId}
          amount={activeVisaPayment.amount}
          paymentDate={activeVisaPayment.paymentDate}
          notes={activeVisaPayment.notes || `تسديد دين`}
          onSuccess={handleTranzilaSuccess}
          onFailure={() => {
            setTranzilaModalOpen(false);
            setActiveVisaPaymentIndex(null);
            setActiveTranzilaPolicyId(null);
          }}
        />
      )}
    </Dialog>
  );
}
