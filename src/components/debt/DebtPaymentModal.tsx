import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CreditCard, Banknote, Wallet, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TranzilaPaymentModal } from '@/components/payments/TranzilaPaymentModal';

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

interface DebtPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
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
  totalOwed,
  onSuccess,
}: DebtPaymentModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<PolicyPaymentInfo[]>([]);
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [tranzilaEnabled, setTranzilaEnabled] = useState(false);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  const [activeTranzilaPolicyId, setActiveTranzilaPolicyId] = useState<string | null>(null);

  const totalRemaining = policies.reduce((sum, p) => sum + p.remaining, 0);
  const totalPrice = policies.reduce((sum, p) => sum + p.price, 0);
  const totalPaid = policies.reduce((sum, p) => sum + p.paid, 0);
  const amountNum = parseFloat(amount) || 0;
  const isOverpaying = amountNum > totalRemaining;
  const isValid = amountNum > 0 && amountNum <= totalRemaining && (paymentType !== 'cheque' || chequeNumber.trim());

  useEffect(() => {
    if (open && clientId) {
      fetchPolicyPaymentInfo();
      checkTranzilaEnabled();
      // Reset form
      setAmount('');
      setChequeNumber('');
      setNotes('');
      setPaymentType('cash');
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
      // Fetch active unpaid policies for this client (excluding ELZAMI which has no debt)
      const { data: policiesData, error: policiesError } = await supabase
        .from('policies')
        .select('id, policy_type_parent, policy_type_child, insurance_price, branch_id, car:cars(car_number)')
        .eq('client_id', clientId)
        .eq('cancelled', false)
        .is('deleted_at', null)
        .neq('policy_type_parent', 'ELZAMI')
        .gte('end_date', new Date().toISOString().split('T')[0]);

      if (policiesError) throw policiesError;

      const policyIds = (policiesData || []).map(p => p.id);

      if (policyIds.length === 0) {
        setPolicies([]);
        setLoading(false);
        return;
      }

      // Fetch payments for these policies
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('policy_payments')
        .select('policy_id, amount, refused')
        .in('policy_id', policyIds);

      if (paymentsError) throw paymentsError;

      // Calculate per-policy info
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
        .filter(p => p.remaining > 0); // Only show policies with remaining balance

      setPolicies(policyInfo);
    } catch (error) {
      console.error('Error fetching policy payment info:', error);
      toast.error('خطأ في جلب بيانات الدفع');
    } finally {
      setLoading(false);
    }
  };

  const calculateSplitPayments = () => {
    // Split payment proportionally based on remaining amounts
    const splits: { policyId: string; amount: number; branchId: string | null }[] = [];
    
    if (amountNum <= 0 || totalRemaining <= 0) return splits;

    // Calculate proportion for each policy
    policies.forEach(policy => {
      if (policy.remaining > 0) {
        const proportion = policy.remaining / totalRemaining;
        const policyPayment = Math.min(amountNum * proportion, policy.remaining);
        if (policyPayment > 0) {
          splits.push({
            policyId: policy.policyId,
            amount: Math.round(policyPayment * 100) / 100,
            branchId: policy.branchId,
          });
        }
      }
    });

    // Adjust for rounding errors
    const totalSplit = splits.reduce((sum, s) => sum + s.amount, 0);
    const diff = amountNum - totalSplit;
    if (splits.length > 0 && Math.abs(diff) > 0.001) {
      splits[0].amount = Math.round((splits[0].amount + diff) * 100) / 100;
    }

    return splits;
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    // If Visa selected, use Tranzila flow
    if (paymentType === 'visa') {
      if (!tranzilaEnabled) {
        toast.error('الدفع بالبطاقة غير مفعل');
        return;
      }
      const firstPolicy = policies.find(p => p.remaining > 0);
      if (firstPolicy) {
        setActiveTranzilaPolicyId(firstPolicy.policyId);
        setTranzilaModalOpen(true);
      }
      return;
    }

    const splits = calculateSplitPayments();
    if (splits.length === 0) {
      toast.error('لا توجد دفعات للإضافة');
      return;
    }

    setSaving(true);
    try {
      const payments = splits.map(split => ({
        policy_id: split.policyId,
        amount: split.amount,
        payment_type: paymentType as 'cash' | 'cheque' | 'transfer' | 'visa',
        payment_date: paymentDate,
        cheque_number: paymentType === 'cheque' ? chequeNumber : null,
        notes: notes || `تسديد دين (${policies.length} وثائق)`,
        branch_id: split.branchId,
      }));

      const { error } = await supabase
        .from('policy_payments')
        .insert(payments);

      if (error) throw error;

      toast.success(`تم إضافة ${splits.length} دفعات بنجاح`);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error saving payments:', error);
      toast.error(error.message || 'خطأ في حفظ الدفعات');
    } finally {
      setSaving(false);
    }
  };

  const handleTranzilaSuccess = async () => {
    setTranzilaModalOpen(false);
    const splits = calculateSplitPayments();
    const otherSplits = splits.filter(s => s.policyId !== activeTranzilaPolicyId);
    
    if (otherSplits.length > 0) {
      try {
        const payments = otherSplits.map(split => ({
          policy_id: split.policyId,
          amount: split.amount,
          payment_type: 'visa' as const,
          payment_date: new Date().toISOString().split('T')[0],
          notes: notes || `تسديد دين (${policies.length} وثائق)`,
          branch_id: split.branchId,
        }));

        await supabase.from('policy_payments').insert(payments);
      } catch (error) {
        console.error('Error creating additional payments:', error);
      }
    }

    toast.success('تم الدفع بنجاح');
    onOpenChange(false);
    onSuccess();
  };

  const getPolicyLabel = (policy: PolicyPaymentInfo) => {
    const parent = policyTypeLabels[policy.policyType] || policy.policyType;
    const child = policy.policyTypeChild === 'THIRD_FULL' ? 'شامل' : 
                  policy.policyTypeChild === 'THIRD_ONLY' ? 'طرف ثالث' : '';
    return child ? `${parent} - ${child}` : parent;
  };

  const splits = calculateSplitPayments();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
            <div className="border rounded-lg divide-y max-h-40 overflow-auto">
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

            {/* Payment Form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>المبلغ</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={`أقصى: ₪${totalRemaining.toLocaleString()}`}
                    className={isOverpaying ? 'border-destructive' : ''}
                  />
                  {isOverpaying && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      المبلغ أكبر من المتبقي
                    </p>
                  )}
                </div>
                <div>
                  <Label>طريقة الدفع</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
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
                  <Label>تاريخ الدفع</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                  />
                </div>
                {paymentType === 'cheque' && (
                  <div>
                    <Label>رقم الشيك</Label>
                    <Input
                      value={chequeNumber}
                      onChange={e => setChequeNumber(e.target.value)}
                      placeholder="رقم الشيك"
                      maxLength={8}
                    />
                  </div>
                )}
              </div>

              <div>
                <Label>ملاحظات (اختياري)</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="ملاحظات إضافية"
                />
              </div>
            </div>

            {/* Split Preview */}
            {amountNum > 0 && !isOverpaying && splits.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  توزيع الدفعة على الوثائق:
                </p>
                <div className="space-y-1">
                  {splits.map(split => {
                    const policy = policies.find(p => p.policyId === split.policyId);
                    return (
                      <div key={split.policyId} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {policy ? getPolicyLabel(policy) : split.policyId}
                          {policy?.carNumber && <span className="text-xs ml-1">({policy.carNumber})</span>}
                        </span>
                        <span className="font-medium">₪{split.amount.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
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
      {activeTranzilaPolicyId && (
        <TranzilaPaymentModal
          open={tranzilaModalOpen}
          onOpenChange={setTranzilaModalOpen}
          policyId={activeTranzilaPolicyId}
          amount={amountNum}
          paymentDate={paymentDate}
          notes={notes || `تسديد دين (${policies.length} وثائق)`}
          onSuccess={handleTranzilaSuccess}
          onFailure={() => setTranzilaModalOpen(false)}
        />
      )}
    </Dialog>
  );
}
