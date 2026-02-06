import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, CreditCard, Banknote, Wallet, CheckCircle, DollarSign, Plus, Trash2, Split, Upload, X, ImageIcon, Scan } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TranzilaPaymentModal } from '@/components/payments/TranzilaPaymentModal';
import { ChequeScannerDialog } from '@/components/payments/ChequeScannerDialog';
import { sanitizeChequeNumber, CHEQUE_NUMBER_MAX_LENGTH } from '@/lib/chequeUtils';
import { useToast } from '@/hooks/use-toast';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';

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
  const { profile } = useAuth();
  const { branches } = useBranches();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState({ totalInsurance: 0, totalPaid: 0, totalRefunds: 0, totalRemaining: 0 });
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  
  // Get first active branch as default
  const defaultBranchId = branches.length > 0 ? branches[0].id : null;
  const [activeVisaPaymentIndex, setActiveVisaPaymentIndex] = useState<number | null>(null);
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [previewUrls, setPreviewUrls] = useState<PreviewUrls>({});
  const [chequeScannerOpen, setChequeScannerOpen] = useState(false);

  // Calculate total payments
  const paidVisaTotal = paymentLines
    .filter(p => p.paymentType === 'visa' && p.tranzilaPaid)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const pendingPaymentsTotal = paymentLines
    .filter(p => !(p.paymentType === 'visa' && p.tranzilaPaid))
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const totalPaymentAmount = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);
  const effectiveRemaining = balance.totalRemaining - paidVisaTotal;
  const isOverpaying = pendingPaymentsTotal > effectiveRemaining;
  const hasUnpaidVisa = paymentLines.some(p => p.paymentType === 'visa' && !p.tranzilaPaid);

  const isValid = paymentLines.length > 0 && 
    totalPaymentAmount > 0 && 
    !isOverpaying &&
    !hasUnpaidVisa &&
    paymentLines.every(p => {
      if (p.paymentType === 'cheque' && !p.chequeNumber?.trim()) return false;
      if (p.paymentType === 'visa' && !p.tranzilaPaid && p.amount <= 0) return false;
      return p.amount > 0;
    });

  useEffect(() => {
    if (open && clientId) {
      fetchClientBalance();
      setPaymentLines([{
        id: crypto.randomUUID(),
        amount: 0,
        paymentType: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
      }]);
      setPreviewUrls({});
    }
  }, [open, clientId]);

  const fetchClientBalance = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_client_balance', { p_client_id: clientId });
      if (error) throw error;
      
      if (data && data.length > 0) {
        const row = data[0];
        setBalance({
          totalInsurance: Number(row.total_insurance) || 0,
          totalPaid: Number(row.total_paid) || 0,
          totalRefunds: Number(row.total_refunds) || 0,
          totalRemaining: Number(row.total_remaining) || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching client balance:', error);
      toast.error('خطأ في جلب رصيد العميل');
    } finally {
      setLoading(false);
    }
  };

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

    const newPreviewUrls = validFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(prev => ({
      ...prev,
      [paymentId]: [...(prev[paymentId] || []), ...newPreviewUrls],
    }));
    
    const payment = paymentLines.find(p => p.id === paymentId);
    if (payment) {
      const existingFiles = payment.pendingImages || [];
      updatePaymentLine(paymentId, 'pendingImages', [...existingFiles, ...validFiles]);
    }
  };

  const removeImage = (paymentId: string, index: number) => {
    const urls = previewUrls[paymentId] || [];
    if (urls[index]) {
      URL.revokeObjectURL(urls[index]);
    }
    
    setPreviewUrls(prev => {
      const newUrls = (prev[paymentId] || []).filter((_, i) => i !== index);
      if (newUrls.length === 0) {
        const { [paymentId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [paymentId]: newUrls };
    });
    
    const payment = paymentLines.find(p => p.id === paymentId);
    if (payment && payment.pendingImages) {
      const newFiles = payment.pendingImages.filter((_, i) => i !== index);
      updatePaymentLine(paymentId, 'pendingImages', newFiles.length > 0 ? newFiles : undefined);
    }
  };

  const getPreviewUrls = (paymentId: string) => previewUrls[paymentId] || [];

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
    if (splitCount < 2 || splitCount > 12 || balance.totalRemaining <= 0) return;
    
    const amountPerInstallment = Math.floor(balance.totalRemaining / splitCount);
    const remainder = balance.totalRemaining - (amountPerInstallment * splitCount);
    
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

  const base64ToBlob = (base64: string, type = 'image/jpeg'): Blob => {
    try {
      const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
      const byteString = atob(cleanBase64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type });
    } catch (e) {
      console.error('Failed to convert base64 to blob:', e);
      return new Blob([], { type });
    }
  };

  const handleScannedCheques = (cheques: any[]) => {
    const newPayments: PaymentLine[] = [];
    const newPreviewUrls: PreviewUrls = {};
    
    for (const cheque of cheques) {
      const paymentId = crypto.randomUUID();
      const payment: PaymentLine = {
        id: paymentId,
        amount: cheque.amount || 0,
        paymentType: 'cheque' as const,
        paymentDate: cheque.payment_date || new Date().toISOString().split('T')[0],
        chequeNumber: cheque.cheque_number || '',
      };
      
      if (cheque.cropped_base64) {
        try {
          const blob = base64ToBlob(cheque.cropped_base64);
          const file = new File([blob], `cheque_${cheque.cheque_number || paymentId}.jpg`, { type: 'image/jpeg' });
          payment.pendingImages = [file];
          newPreviewUrls[paymentId] = [URL.createObjectURL(blob)];
        } catch (e) {
          console.error('Failed to convert cheque image:', e);
        }
      }
      
      newPayments.push(payment);
    }
    
    setPreviewUrls(prev => ({ ...prev, ...newPreviewUrls }));
    setPaymentLines(prev => [...prev, ...newPayments]);
    toast.success(`تم إضافة ${newPayments.length} دفعة شيك مع الصور`);
  };

  const handleVisaPayClick = (index: number) => {
    const payment = paymentLines[index];
    if (!payment || payment.amount <= 0) return;

    setActiveVisaPaymentIndex(index);
    setTranzilaModalOpen(true);
  };

  const handleTranzilaSuccess = async () => {
    setTranzilaModalOpen(false);
    
    if (activeVisaPaymentIndex !== null) {
      updatePaymentLine(paymentLines[activeVisaPaymentIndex].id, 'tranzilaPaid', true);
    }
    
    setActiveVisaPaymentIndex(null);
  };

  const uploadChequeImage = async (paymentId: string, file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'client_payment');
      formData.append('entity_id', paymentId);

      const { data, error } = await supabase.functions.invoke('upload-media', {
        body: formData,
      });

      if (error) throw error;
      return data?.url || null;
    } catch (err) {
      console.error('Error uploading cheque image:', err);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    const unpaidVisaPayments = paymentLines.filter(p => p.paymentType === 'visa' && !p.tranzilaPaid);
    if (unpaidVisaPayments.length > 0) {
      toast.error('يرجى إتمام الدفع بالبطاقة أولاً');
      return;
    }

    setSaving(true);
    
    try {
      for (const paymentLine of paymentLines) {
        // Skip visa payments that are already paid via Tranzila
        if (paymentLine.paymentType === 'visa' && paymentLine.tranzilaPaid) {
          continue;
        }
        
        if (paymentLine.paymentType !== 'visa') {
          // Upload cheque image first if exists
          let chequeImageUrl: string | null = null;
          if (paymentLine.paymentType === 'cheque' && paymentLine.pendingImages && paymentLine.pendingImages.length > 0) {
            chequeImageUrl = await uploadChequeImage(crypto.randomUUID(), paymentLine.pendingImages[0]);
          }

          // Insert directly into client_payments (wallet-centric)
          const { error } = await supabase
            .from('client_payments')
            .insert({
              client_id: clientId,
              amount: paymentLine.amount,
              payment_type: paymentLine.paymentType,
              payment_date: paymentLine.paymentDate,
              cheque_number: paymentLine.paymentType === 'cheque' ? paymentLine.chequeNumber : null,
              cheque_image_url: chequeImageUrl,
              notes: paymentLine.notes || `تسديد دين`,
              branch_id: defaultBranchId,
              created_by_admin_id: profile?.id,
            });
          
          if (error) throw error;
        }
      }

      toast.success('تم تسديد الدفعات بنجاح');
      
      // Send confirmation SMS
      if (clientPhone) {
        try {
          const message = `مرحباً ${clientName}، تم استلام دفعة بمبلغ ₪${totalPaymentAmount.toLocaleString()}. شكراً لك!`;
          await supabase.functions.invoke('send-sms', {
            body: {
              phone: clientPhone,
              message,
              sms_type: 'payment_confirmation'
            }
          });
          toast.success('تم إرسال رسالة التأكيد للعميل');
        } catch (smsErr) {
          console.error('Error sending payment SMS:', smsErr);
        }
      }
      
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error saving payments:', error);
      toast.error(error.message || 'خطأ في حفظ الدفعات');
    } finally {
      setSaving(false);
    }
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
        ) : balance.totalRemaining <= 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p>لا توجد ديون مستحقة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards - Simplified */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">إجمالي التأمين</p>
                <p className="text-lg font-bold ltr-nums">₪{balance.totalInsurance.toLocaleString('en-US')}</p>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">المدفوع</p>
                <p className="text-lg font-bold text-green-600 ltr-nums">
                  ₪{(balance.totalPaid + paidVisaTotal).toLocaleString('en-US')}
                </p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">إجمالي المتبقي</p>
                <p className="text-lg font-bold text-destructive ltr-nums">
                  ₪{effectiveRemaining.toLocaleString('en-US')}
                </p>
              </div>
            </div>

            {/* Info Badge */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
              <p className="text-sm text-blue-600">
                💡 الدفعة تُخصم من إجمالي المتبقي للعميل مباشرة (نظام المحفظة الموحد)
              </p>
            </div>

            {/* Payment Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">سطور الدفع</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setChequeScannerOpen(true)}
                    className="gap-2"
                  >
                    <Scan className="h-4 w-4" />
                    مسح شيكات
                  </Button>
                  <Popover open={splitPopoverOpen} onOpenChange={setSplitPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="gap-2">
                        <Split className="h-4 w-4" />
                        تقسيط
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64" align="end">
                      <div className="space-y-3">
                        <Label>عدد الأقساط</Label>
                        <Input
                          type="number"
                          min={2}
                          max={12}
                          value={splitCount}
                          onChange={(e) => setSplitCount(parseInt(e.target.value) || 2)}
                        />
                        <p className="text-xs text-muted-foreground">
                          قسط شهري: ₪{Math.floor(balance.totalRemaining / splitCount).toLocaleString('en-US')}
                        </p>
                        <Button onClick={handleSplitPayments} className="w-full">
                          تقسيم
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button type="button" variant="outline" size="sm" onClick={addPaymentLine} className="gap-2">
                    <Plus className="h-4 w-4" />
                    إضافة سطر
                  </Button>
                </div>
              </div>

              {paymentLines.map((payment, index) => (
                <Card key={payment.id} className="border-2">
                  <CardContent className="p-4 space-y-3">
                    {/* Row 1: Amount + Type + Date */}
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-4">
                        <Label className="text-xs">المبلغ</Label>
                        <Input
                          type="number"
                          value={payment.amount || ''}
                          onChange={(e) => updatePaymentLine(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="ltr-nums text-lg font-bold"
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-4">
                        <Label className="text-xs">نوع الدفع</Label>
                        <Select
                          value={payment.paymentType}
                          onValueChange={(value) => updatePaymentLine(payment.id, 'paymentType', value as PaymentLine['paymentType'])}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentTypes.map(type => (
                              <SelectItem key={type.value} value={type.value}>
                                <span className="flex items-center gap-2">
                                  <type.icon className="h-4 w-4" />
                                  {type.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs">التاريخ</Label>
                        <ArabicDatePicker
                          value={payment.paymentDate}
                          onChange={(date) => updatePaymentLine(payment.id, 'paymentDate', date || '')}
                        />
                      </div>
                      <div className="col-span-1 flex items-end justify-center">
                        {paymentLines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removePaymentLine(payment.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Cheque Number */}
                    {payment.paymentType === 'cheque' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">رقم الشيك</Label>
                          <Input
                            value={payment.chequeNumber || ''}
                            onChange={(e) => updatePaymentLine(payment.id, 'chequeNumber', sanitizeChequeNumber(e.target.value))}
                            placeholder="أدخل رقم الشيك"
                            maxLength={CHEQUE_NUMBER_MAX_LENGTH}
                            className="ltr-nums"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">صورة الشيك</Label>
                          <div className="flex items-center gap-2">
                            <label className="flex-1 cursor-pointer">
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                onChange={(e) => handleImageSelect(payment.id, e)}
                                className="hidden"
                              />
                              <Button type="button" variant="outline" className="w-full gap-2" asChild>
                                <span>
                                  <Upload className="h-4 w-4" />
                                  {getPreviewUrls(payment.id).length > 0 ? `${getPreviewUrls(payment.id).length} صور` : 'رفع صورة'}
                                </span>
                              </Button>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Image Previews */}
                    {getPreviewUrls(payment.id).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {getPreviewUrls(payment.id).map((url, imgIndex) => (
                          <div key={imgIndex} className="relative">
                            <img src={url} alt="صورة" className="h-16 w-16 object-cover rounded border" />
                            <button
                              type="button"
                              onClick={() => removeImage(payment.id, imgIndex)}
                              className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Visa Payment Button */}
                    {payment.paymentType === 'visa' && (
                      <div className="flex items-center gap-2">
                        {payment.tranzilaPaid ? (
                          <div className="flex items-center gap-2 text-green-600 font-medium">
                            <CheckCircle className="h-5 w-5" />
                            <span>تم الدفع بنجاح</span>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => handleVisaPayClick(index)}
                            disabled={!payment.amount || payment.amount <= 0}
                            className="gap-2"
                          >
                            <CreditCard className="h-4 w-4" />
                            ادفع ₪{payment.amount?.toLocaleString('en-US') || 0}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <Label className="text-xs">ملاحظات (اختياري)</Label>
                      <Input
                        value={payment.notes || ''}
                        onChange={(e) => updatePaymentLine(payment.id, 'notes', e.target.value)}
                        placeholder="ملاحظات..."
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Payment Summary */}
            <div className={cn(
              "rounded-lg p-4",
              isOverpaying ? "bg-destructive/10 border border-destructive/30" : "bg-primary/10"
            )}>
              <div className="flex items-center justify-between">
                <span className="font-medium">إجمالي المبلغ المدخل:</span>
                <span className={cn(
                  "text-xl font-bold ltr-nums",
                  isOverpaying ? "text-destructive" : "text-primary"
                )}>
                  ₪{totalPaymentAmount.toLocaleString('en-US')}
                </span>
              </div>
              {isOverpaying && (
                <p className="text-sm text-destructive mt-2">
                  ⚠️ المبلغ المدخل أكبر من المتبقي. يرجى تعديل المبلغ.
                </p>
              )}
              {hasUnpaidVisa && (
                <p className="text-sm text-amber-600 mt-2">
                  ⚠️ يوجد دفعة فيزا غير مكتملة. يرجى إتمام الدفع.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || saving || loading}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            تأكيد الدفع
          </Button>
        </DialogFooter>

        {/* Cheque Scanner */}
        <ChequeScannerDialog
          open={chequeScannerOpen}
          onOpenChange={setChequeScannerOpen}
          onConfirm={handleScannedCheques}
        />

        {/* Tranzila Modal */}
        {activeVisaPayment && (
          <TranzilaPaymentModal
            open={tranzilaModalOpen}
            onOpenChange={setTranzilaModalOpen}
            policyId={clientId}
            amount={activeVisaPayment.amount}
            paymentDate={activeVisaPayment.paymentDate}
            notes={activeVisaPayment.notes}
            onSuccess={handleTranzilaSuccess}
            onFailure={() => setTranzilaModalOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
