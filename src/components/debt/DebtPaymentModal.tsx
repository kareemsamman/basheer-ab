import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Banknote, Wallet, CheckCircle, DollarSign, Plus, Trash2, Split, Upload, X, Scan } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChequeScannerDialog } from '@/components/payments/ChequeScannerDialog';
import { sanitizeChequeNumber, CHEQUE_NUMBER_MAX_LENGTH } from '@/lib/chequeUtils';
import { useToast } from '@/hooks/use-toast';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';

interface PaymentLine {
  id: string;
  amount: number;
  paymentType: 'cash' | 'cheque' | 'transfer';
  paymentDate: string;
  chequeNumber?: string;
  notes?: string;
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
  const [walletBalance, setWalletBalance] = useState<{
    total_debits: number;
    total_credits: number;
    total_refunds: number;
    wallet_balance: number;
  } | null>(null);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [previewUrls, setPreviewUrls] = useState<PreviewUrls>({});
  const [chequeScannerOpen, setChequeScannerOpen] = useState(false);
  const [clientBranchId, setClientBranchId] = useState<string | null>(null);

  // Calculate totals
  const totalPaymentAmount = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);
  const effectiveRemaining = walletBalance?.wallet_balance || 0;
  const isOverpaying = totalPaymentAmount > effectiveRemaining;

  const isValid = paymentLines.length > 0 && 
    totalPaymentAmount > 0 && 
    !isOverpaying &&
    paymentLines.every(p => {
      if (p.paymentType === 'cheque' && !p.chequeNumber?.trim()) return false;
      return p.amount > 0;
    });

  useEffect(() => {
    if (open && clientId) {
      fetchWalletBalance();
      fetchClientBranch();
      setPaymentLines([{
        id: crypto.randomUUID(),
        amount: 0,
        paymentType: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
      }]);
      setPreviewUrls({});
    }
  }, [open, clientId]);

  const fetchWalletBalance = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_client_wallet_balance', {
        p_client_id: clientId
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setWalletBalance(data[0]);
      } else {
        setWalletBalance({ total_debits: 0, total_credits: 0, total_refunds: 0, wallet_balance: 0 });
      }
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      toast.error('خطأ في جلب رصيد المحفظة');
    } finally {
      setLoading(false);
    }
  };

  const fetchClientBranch = async () => {
    try {
      const { data } = await supabase
        .from('clients')
        .select('branch_id')
        .eq('id', clientId)
        .single();
      
      if (data) {
        setClientBranchId(data.branch_id);
      }
    } catch (error) {
      console.error('Error fetching client branch:', error);
    }
  };

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
    const remaining = walletBalance?.wallet_balance || 0;
    if (splitCount < 2 || splitCount > 12 || remaining <= 0) return;
    
    const amountPerInstallment = Math.floor(remaining / splitCount);
    const remainder = remaining - (amountPerInstallment * splitCount);
    
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

  // Helper to convert base64 to Blob
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

  const handleSubmit = async () => {
    if (!isValid) return;

    setSaving(true);
    const allCreatedPaymentIds: string[] = [];
    
    try {
      // Get current user for admin tracking
      const { data: { user } } = await supabase.auth.getUser();

      for (const paymentLine of paymentLines) {
        if (paymentLine.amount > 0) {
          // Insert into client_payments (new wallet-based table)
          const { data: insertedPayment, error } = await supabase
            .from('client_payments')
            .insert({
              client_id: clientId,
              amount: paymentLine.amount,
              payment_type: paymentLine.paymentType,
              payment_date: paymentLine.paymentDate,
              cheque_number: paymentLine.paymentType === 'cheque' ? paymentLine.chequeNumber : null,
              notes: paymentLine.notes || 'تسديد دين',
              branch_id: clientBranchId,
              created_by_admin_id: user?.id,
            })
            .select('id')
            .single();
          
          if (error) throw error;

          if (insertedPayment) {
            allCreatedPaymentIds.push(insertedPayment.id);

            // Upload images if any
            if (paymentLine.pendingImages && paymentLine.pendingImages.length > 0) {
              for (let imgIndex = 0; imgIndex < paymentLine.pendingImages.length; imgIndex++) {
                const file = paymentLine.pendingImages[imgIndex];
                const formData = new FormData();
                formData.append('file', file);
                formData.append('entity_type', 'client_payment');
                formData.append('entity_id', insertedPayment.id);

                try {
                  const { data: uploadResult, error: uploadError } = await supabase.functions.invoke('upload-media', {
                    body: formData,
                  });

                  if (!uploadError && uploadResult?.url) {
                    // Update the payment with cheque image URL
                    if (imgIndex === 0) {
                      await supabase
                        .from('client_payments')
                        .update({ cheque_image_url: uploadResult.url })
                        .eq('id', insertedPayment.id);
                    }
                  }
                } catch (uploadErr) {
                  console.error('Error uploading payment image:', uploadErr);
                }
              }
            }
          }
        }
      }

      toast.success('تم تسديد الدفعات بنجاح');
      
      // Send confirmation SMS
      if (allCreatedPaymentIds.length > 0 && clientPhone) {
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
        } catch (smsError) {
          console.error('Error sending payment confirmation SMS:', smsError);
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

  const remainingBalance = walletBalance?.wallet_balance || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
        ) : remainingBalance <= 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
            <p>لا توجد ديون مستحقة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Wallet Balance Summary */}
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي الديون</p>
                    <p className="text-lg font-bold ltr-nums">₪{(walletBalance?.total_debits || 0).toLocaleString('en-US')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">المدفوع</p>
                    <p className="text-lg font-bold text-success ltr-nums">
                      ₪{((walletBalance?.total_credits || 0) + (walletBalance?.total_refunds || 0)).toLocaleString('en-US')}
                    </p>
                  </div>
                </div>
                <div className="border-t border-primary/20 mt-3 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">إجمالي المتبقي</span>
                    <span className="text-2xl font-bold text-destructive ltr-nums">
                      ₪{effectiveRemaining.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

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
                    <PopoverContent className="w-64">
                      <div className="space-y-3">
                        <Label>عدد الأقساط</Label>
                        <Input
                          type="number"
                          min={2}
                          max={12}
                          value={splitCount}
                          onChange={(e) => setSplitCount(parseInt(e.target.value) || 2)}
                        />
                        <Button onClick={handleSplitPayments} className="w-full">
                          تقسيم إلى {splitCount} أقساط
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="sm" onClick={() => setChequeScannerOpen(true)}>
                    <Scan className="h-4 w-4 ml-2" />
                    مسح شيكات
                  </Button>
                  <Button variant="outline" size="sm" onClick={addPaymentLine}>
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {paymentLines.map((payment) => (
                  <Card key={payment.id} className="p-3">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">المبلغ</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={payment.amount || ''}
                            onChange={(e) => updatePaymentLine(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="ltr-nums"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">الطريقة</Label>
                          <Select
                            value={payment.paymentType}
                            onValueChange={(value) => updatePaymentLine(payment.id, 'paymentType', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentTypes.map(type => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {paymentLines.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="mt-5"
                            onClick={() => removePaymentLine(payment.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">التاريخ</Label>
                          <ArabicDatePicker
                            value={payment.paymentDate}
                            onChange={(date) => updatePaymentLine(payment.id, 'paymentDate', date || '')}
                          />
                        </div>
                        {payment.paymentType === 'cheque' && (
                          <div className="flex-1">
                            <Label className="text-xs">رقم الشيك</Label>
                            <Input
                              value={payment.chequeNumber || ''}
                              onChange={(e) => updatePaymentLine(payment.id, 'chequeNumber', sanitizeChequeNumber(e.target.value))}
                              maxLength={CHEQUE_NUMBER_MAX_LENGTH}
                              placeholder="رقم الشيك"
                              className="font-mono"
                            />
                          </div>
                        )}
                      </div>

                      {/* Image upload for cash/cheque/transfer */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">إيصال/صورة</Label>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              multiple
                              className="hidden"
                              onChange={(e) => handleImageSelect(payment.id, e)}
                            />
                            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                              <Upload className="h-3 w-3 ml-1" />
                              رفع
                            </Badge>
                          </label>
                        </div>
                        {getPreviewUrls(payment.id).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {getPreviewUrls(payment.id).map((url, idx) => (
                              <div key={idx} className="relative group">
                                <img
                                  src={url}
                                  alt={`Preview ${idx + 1}`}
                                  className="h-16 w-16 object-cover rounded border"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImage(payment.id, idx)}
                                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Overpaying Warning */}
            {isOverpaying && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
                ⚠️ المبلغ المدخل أكبر من المتبقي
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving || !isValid || remainingBalance <= 0}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                تسديد ₪{totalPaymentAmount.toLocaleString()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Cheque Scanner */}
      <ChequeScannerDialog
        open={chequeScannerOpen}
        onOpenChange={setChequeScannerOpen}
        onConfirm={handleScannedCheques}
        title="مسح شيكات"
      />
    </Dialog>
  );
}
