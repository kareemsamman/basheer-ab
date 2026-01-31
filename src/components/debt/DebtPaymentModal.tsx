import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, CreditCard, Banknote, Wallet, AlertCircle, CheckCircle, DollarSign, Plus, Trash2, Split, Upload, X, ImageIcon, HelpCircle, Car } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TranzilaPaymentModal } from '@/components/payments/TranzilaPaymentModal';
import { sanitizeChequeNumber, CHEQUE_NUMBER_MAX_LENGTH } from '@/lib/chequeUtils';
import { useToast } from '@/hooks/use-toast';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';

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
  pendingImages?: File[];
}

interface PreviewUrls {
  [paymentId: string]: string[];
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
  { value: 'visa', label: 'فيزا', icon: CreditCard },
  { value: 'transfer', label: 'تحويل', icon: Wallet },
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
  const { toast: uiToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<PolicyPaymentInfo[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  const [activeVisaPaymentIndex, setActiveVisaPaymentIndex] = useState<number | null>(null);
  const [activeTranzilaPolicyId, setActiveTranzilaPolicyId] = useState<string | null>(null);
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [previewUrls, setPreviewUrls] = useState<PreviewUrls>({});
  const [selectedCars, setSelectedCars] = useState<string[]>([]);

  // Extract unique car numbers for filter
  const uniqueCars = React.useMemo(() => {
    const cars = policies
      .filter(p => p.carNumber)
      .map(p => p.carNumber!)
      .filter((v, i, a) => a.indexOf(v) === i);
    return cars;
  }, [policies]);

  // Toggle car selection
  const toggleCar = (car: string) => {
    setSelectedCars(prev => 
      prev.includes(car) 
        ? prev.filter(c => c !== car) 
        : [...prev, car]
    );
  };

  // Filter policies by selected cars (empty array = all cars)
  const filteredPolicies = React.useMemo(() => {
    if (selectedCars.length === 0) return policies;
    return policies.filter(p => p.carNumber && selectedCars.includes(p.carNumber));
  }, [policies, selectedCars]);

  const totalRemaining = filteredPolicies.reduce((sum, p) => sum + p.remaining, 0);
  const totalPrice = filteredPolicies.reduce((sum, p) => sum + p.price, 0);
  const totalPaid = filteredPolicies.reduce((sum, p) => sum + p.paid, 0);
  
  // Calculate total payments - count paid visa payments as already completed
  const paidVisaTotal = paymentLines
    .filter(p => p.paymentType === 'visa' && p.tranzilaPaid)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const pendingPaymentsTotal = paymentLines
    .filter(p => !(p.paymentType === 'visa' && p.tranzilaPaid))
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const totalPaymentAmount = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  // Remaining to pay should account for already completed visa payments
  const effectiveRemaining = totalRemaining - paidVisaTotal;
  const isOverpaying = pendingPaymentsTotal > effectiveRemaining;
  
  // Check for unpaid visa payments
  const hasUnpaidVisa = paymentLines.some(p => p.paymentType === 'visa' && !p.tranzilaPaid);

  // Check if all non-visa payments have valid data, and visa payments are either paid or have valid amount
  const isValid = paymentLines.length > 0 && 
    totalPaymentAmount > 0 && 
    !isOverpaying &&
    !hasUnpaidVisa && // Block if unpaid visa exists
    paymentLines.every(p => {
      if (p.paymentType === 'cheque' && !p.chequeNumber?.trim()) return false;
      if (p.paymentType === 'visa' && !p.tranzilaPaid && p.amount <= 0) return false;
      return p.amount > 0;
    });

  useEffect(() => {
    if (open && clientId) {
      fetchPolicyPaymentInfo();
      // Reset form with one empty payment line
      setPaymentLines([{
        id: crypto.randomUUID(),
        amount: 0,
        paymentType: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
      }]);
      setPreviewUrls({});
    }
  }, [open, clientId]);

  // Image handling functions
  const handleImageSelect = (paymentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        uiToast({ title: "خطأ", description: "يرجى اختيار صور أو ملفات PDF فقط", variant: "destructive" });
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        uiToast({ title: "خطأ", description: "حجم الملف يجب أن يكون أقل من 10MB", variant: "destructive" });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Create preview URLs
    const newPreviewUrls = validFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(prev => ({
      ...prev,
      [paymentId]: [...(prev[paymentId] || []), ...newPreviewUrls],
    }));
    
    // Store files in payment object for later upload
    const payment = paymentLines.find(p => p.id === paymentId);
    if (payment) {
      const existingFiles = payment.pendingImages || [];
      updatePaymentLine(paymentId, 'pendingImages', [...existingFiles, ...validFiles]);
    }
  };

  const removeImage = (paymentId: string, index: number) => {
    // Revoke preview URL
    const urls = previewUrls[paymentId] || [];
    if (urls[index]) {
      URL.revokeObjectURL(urls[index]);
    }
    
    // Update preview URLs
    setPreviewUrls(prev => {
      const newUrls = (prev[paymentId] || []).filter((_, i) => i !== index);
      if (newUrls.length === 0) {
        const { [paymentId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [paymentId]: newUrls };
    });
    
    // Update payment files
    const payment = paymentLines.find(p => p.id === paymentId);
    if (payment && payment.pendingImages) {
      const newFiles = payment.pendingImages.filter((_, i) => i !== index);
      updatePaymentLine(paymentId, 'pendingImages', newFiles.length > 0 ? newFiles : undefined);
    }
  };

  const getPreviewUrls = (paymentId: string) => previewUrls[paymentId] || [];

  // State for total ELZAMI payments (fetched separately)
  const [elzamiPaymentsTotal, setElzamiPaymentsTotal] = useState(0);

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

      // Also fetch ELZAMI policies for this client to get their payments (for total display)
      const { data: elzamiPoliciesData } = await supabase
        .from('policies')
        .select('id')
        .eq('client_id', clientId)
        .eq('cancelled', false)
        .is('deleted_at', null)
        .eq('policy_type_parent', 'ELZAMI');

      const elzamiPolicyIds = (elzamiPoliciesData || []).map(p => p.id);
      let elzamiTotal = 0;

      if (elzamiPolicyIds.length > 0) {
        const { data: elzamiPayments } = await supabase
          .from('policy_payments')
          .select('amount, refused')
          .in('policy_id', elzamiPolicyIds);

        elzamiTotal = (elzamiPayments || [])
          .filter(p => !p.refused)
          .reduce((sum, p) => sum + p.amount, 0);
      }
      setElzamiPaymentsTotal(elzamiTotal);

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

  /**
   * Sequential "fill one by one" distribution:
   * - Fills policies in order until each is complete before moving to next
   * - For cheques: Keeps as single record on first policy with space
   * - For cash/transfer: Can span multiple policies
   */
  const calculateSplitPayments = (amount: number, paymentType: string = 'cash') => {
    const splits: { policyId: string; amount: number; branchId: string | null }[] = [];
    
    if (amount <= 0 || totalRemaining <= 0) return splits;

    // Get filtered policies with remaining balance, sorted by remaining (smallest first for efficient filling)
    const policiesWithBalance = filteredPolicies
      .filter(p => p.remaining > 0)
      .sort((a, b) => a.remaining - b.remaining);

    if (policiesWithBalance.length === 0) return splits;

    // For cheques: assign FULL amount to a single policy that can fit it
    // Cheques are physical documents - cannot be split, must remain intact
    if (paymentType === 'cheque') {
      // Find a policy where the cheque fits entirely (remaining >= cheque amount)
      const policyWithSpace = policiesWithBalance.find(p => p.remaining >= amount);
      
      if (policyWithSpace) {
        // Found a policy that can accept the full cheque
        splits.push({
          policyId: policyWithSpace.policyId,
          amount: amount, // Keep FULL cheque amount
          branchId: policyWithSpace.branchId,
        });
      } else {
        // No single policy can fit the full cheque
        // Put it on the policy with largest remaining balance (user should be warned separately)
        const largestPolicy = policiesWithBalance[policiesWithBalance.length - 1];
        splits.push({
          policyId: largestPolicy.policyId,
          amount: amount, // Keep FULL cheque amount - validation will catch overpayment
          branchId: largestPolicy.branchId,
        });
      }
      return splits;
    }

    // For cash/transfer: fill policies sequentially one by one
    let remainingAmount = amount;
    
    for (const policy of policiesWithBalance) {
      if (remainingAmount <= 0) break;
      
      const paymentForPolicy = Math.min(remainingAmount, policy.remaining);
      // Only add if amount is greater than 0 (protect against floating point issues)
      if (paymentForPolicy > 0.001) {
        const roundedAmount = Math.round(paymentForPolicy * 100) / 100;
        // Double-check after rounding
        if (roundedAmount > 0) {
          splits.push({
            policyId: policy.policyId,
            amount: roundedAmount,
            branchId: policy.branchId,
          });
          remainingAmount -= paymentForPolicy;
        }
      }
    }

    // Final filter to ensure no 0-amount entries
    return splits.filter(s => s.amount > 0);
  };

  const handleVisaPayClick = (index: number) => {
    const payment = paymentLines[index];
    if (!payment || payment.amount <= 0) return;

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

  const sendPaymentConfirmationSms = async (paidAmount: number, paymentId?: string) => {
    if (!clientPhone) return;
    
    try {
      // Generate payment receipt instead of full client report
      const { data: receiptData, error: receiptError } = await supabase.functions.invoke('generate-payment-receipt', {
        body: { payment_id: paymentId }
      });
      
      if (receiptError) {
        console.error('Error generating payment receipt:', receiptError);
        return;
      }
      
      const receiptUrl = receiptData?.receipt_url;
      
      // Send SMS with payment confirmation and receipt link
      const message = `مرحباً ${clientName}، تم استلام دفعة بمبلغ ₪${paidAmount.toLocaleString()}. شكراً لك!\n\nلعرض وصل الدفع:\n${receiptUrl || 'غير متوفر'}`;
      
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
      // Process each payment line
      for (const paymentLine of paymentLines) {
        // Skip visa payments that are already paid via Tranzila - payment record already created
        if (paymentLine.paymentType === 'visa' && paymentLine.tranzilaPaid) {
          continue;
        }
        
        if (paymentLine.paymentType !== 'visa') {
          // Non-visa payment - distribute across policies (sequential for cash/transfer, single for cheque)
          const splits = calculateSplitPayments(paymentLine.amount, paymentLine.paymentType);
          
          if (splits.length > 0) {
            // Insert all payments first
            const paymentsToInsert = splits.map(split => ({
              policy_id: split.policyId,
              amount: split.amount,
              payment_type: paymentLine.paymentType,
              payment_date: paymentLine.paymentDate,
              cheque_number: paymentLine.paymentType === 'cheque' ? paymentLine.chequeNumber : null,
              notes: paymentLine.notes || `تسديد دين`,
              branch_id: split.branchId,
            }));

            const { data: insertedPayments, error } = await supabase
              .from('policy_payments')
              .insert(paymentsToInsert)
              .select('id');
            
            if (error) throw error;

            // Upload images for cash/cheque/transfer payments
            if ((paymentLine.paymentType === 'cash' || paymentLine.paymentType === 'cheque' || paymentLine.paymentType === 'transfer') && 
                paymentLine.pendingImages && paymentLine.pendingImages.length > 0 && 
                insertedPayments && insertedPayments.length > 0) {
              
              // Upload images for the first inserted payment (they all share the same cheque/transfer)
              const firstPaymentId = insertedPayments[0].id;
              
              for (let imgIndex = 0; imgIndex < paymentLine.pendingImages.length; imgIndex++) {
                const file = paymentLine.pendingImages[imgIndex];
                const formData = new FormData();
                formData.append('file', file);
                formData.append('entity_type', 'payment');
                formData.append('entity_id', firstPaymentId);

                try {
                  const { data: uploadResult, error: uploadError } = await supabase.functions.invoke('upload-media', {
                    body: formData,
                  });

                  if (!uploadError && uploadResult?.url) {
                    // Insert into payment_images
                    await supabase.from('payment_images').insert({
                      payment_id: firstPaymentId,
                      image_url: uploadResult.url,
                      image_type: imgIndex === 0 ? 'front' : 'back',
                      sort_order: imgIndex,
                    });
                  }
                } catch (uploadErr) {
                  console.error('Error uploading payment image:', uploadErr);
                }
              }
            }
          }
        }
      }

      // Get the first inserted payment ID for the receipt
      let firstPaymentId: string | undefined;
      
      // Find the first non-visa payment's ID for receipt
      for (const paymentLine of paymentLines) {
        if (paymentLine.paymentType !== 'visa' || !paymentLine.tranzilaPaid) {
          // This payment was just inserted, we need its ID
          break;
        }
      }
      
      // Query the most recent payment for this client to get the ID
      const { data: recentPayment } = await supabase
        .from('policy_payments')
        .select('id')
        .in('policy_id', filteredPolicies.map(p => p.policyId))
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      firstPaymentId = recentPayment?.id;

      toast.success('تم تسديد الدفعات بنجاح');
      
      // Send SMS confirmation with payment receipt link
      if (firstPaymentId) {
        await sendPaymentConfirmationSms(totalPaymentAmount, firstPaymentId);
      }
      
      // Close modal and refresh debt list
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
                <p className="text-lg font-bold ltr-nums">₪{totalPrice.toLocaleString('en-US')}</p>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">المدفوع</p>
                <p className="text-lg font-bold text-green-600 ltr-nums">
                  ₪{(totalPaid + paidVisaTotal + elzamiPaymentsTotal).toLocaleString('en-US')}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  منها للدين: ₪{(totalPaid + paidVisaTotal).toLocaleString('en-US')}
                </p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">المتبقي</p>
                <p className="text-lg font-bold text-destructive ltr-nums">
                  ₪{effectiveRemaining.toLocaleString('en-US')}
                </p>
              </div>
            </div>

            {/* Car Selection - Clear Checkbox UI */}
            {uniqueCars.length > 0 && (
              <Card className="border-2 border-dashed border-primary/30">
                <CardHeader className="p-3 pb-0">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    اختر السيارة للدفع
                  </Label>
                </CardHeader>
                <CardContent className="p-3 pt-2">
                  <div className="space-y-2">
                    {/* All Cars Option */}
                    <div 
                      onClick={() => setSelectedCars([])}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                        selectedCars.length === 0 
                          ? "border-primary bg-primary/5" 
                          : "border-muted hover:border-primary/50"
                      )}
                    >
                      <Checkbox checked={selectedCars.length === 0} />
                      <div className="flex-1">
                        <p className="font-medium">كل السيارات</p>
                        <p className="text-sm text-muted-foreground">
                          {uniqueCars.length} سيارات - إجمالي ₪{totalRemaining.toLocaleString('en-US')}
                        </p>
                      </div>
                    </div>
                    
                    {/* Individual Cars */}
                    {uniqueCars.map(car => {
                      const carPolicies = policies.filter(p => p.carNumber === car);
                      const carTotal = carPolicies.reduce((sum, p) => sum + p.remaining, 0);
                      const isSelected = selectedCars.includes(car);
                      
                      return (
                        <div 
                          key={car}
                          onClick={() => toggleCar(car)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                            isSelected 
                              ? "border-primary bg-primary/5" 
                              : "border-muted hover:border-primary/50"
                          )}
                        >
                          <Checkbox checked={isSelected} />
                          <div className="flex-1">
                            <p className="font-bold text-lg font-mono ltr-nums">{car}</p>
                            <p className="text-sm text-muted-foreground">
                              {carPolicies.length} وثائق - ₪{carTotal.toLocaleString('en-US')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Policy List */}
            <div className="border rounded-lg divide-y max-h-32 overflow-auto">
              {filteredPolicies.map(policy => (
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
                    <span className="text-muted-foreground ltr-nums">₪{policy.price.toLocaleString('en-US')}</span>
                    <span className="font-medium text-destructive ltr-nums">
                      -₪{policy.remaining.toLocaleString('en-US')}
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
                <Card key={payment.id} className={cn(
                  "p-3",
                  payment.tranzilaPaid && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                )}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">دفعة {index + 1}</span>
                      {paymentLines.length > 1 && !payment.tranzilaPaid && (
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
                          placeholder={`أقصى: ₪${effectiveRemaining.toLocaleString()}`}
                          disabled={payment.tranzilaPaid}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">طريقة الدفع</Label>
                        <Select 
                          value={payment.paymentType} 
                          onValueChange={v => updatePaymentLine(payment.id, 'paymentType', v)}
                          disabled={payment.tranzilaPaid}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentTypes.map(pt => (
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
                        <ArabicDatePicker
                          value={payment.paymentDate}
                          onChange={(date) => updatePaymentLine(payment.id, 'paymentDate', date)}
                          disabled={payment.tranzilaPaid}
                          compact
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

                    {/* Image Upload Section for Cash/Cheque/Transfer */}
                    {(payment.paymentType === 'cash' || payment.paymentType === 'cheque' || payment.paymentType === 'transfer') && (
                      <div className="pt-3 border-t border-border/50">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground mb-2 block">
                            {payment.paymentType === 'cheque' ? 'صور الشيك (أمامي/خلفي)' : payment.paymentType === 'transfer' ? 'صور إيصال التحويل' : 'صور إيصال الدفع'}
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {/* Preview existing images */}
                            {getPreviewUrls(payment.id).map((url, imgIndex) => (
                              <div key={imgIndex} className="relative group">
                                <img 
                                  src={url} 
                                  alt="" 
                                  className="h-14 w-18 object-cover rounded border"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImage(payment.id, imgIndex)}
                                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {/* Upload button */}
                            <label className="h-14 w-18 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                              <input 
                                type="file" 
                                accept="image/*,application/pdf" 
                                multiple 
                                onChange={(e) => handleImageSelect(payment.id, e)} 
                                className="hidden" 
                              />
                              <Upload className="h-4 w-4 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground mt-0.5">إضافة</span>
                            </label>
                          </div>
                          {payment.pendingImages && payment.pendingImages.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" />
                              {payment.pendingImages.length} ملفات سيتم رفعها عند الحفظ
                            </p>
                          )}
                        </div>
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
                مجموع الدفعات أكبر من المبلغ المتبقي (₪{effectiveRemaining.toLocaleString()})
              </p>
            )}

            {hasUnpaidVisa && (
              <div className="flex items-center gap-2 text-amber-600 text-sm p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>يرجى إتمام الدفع بالبطاقة أولاً قبل الحفظ</span>
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
