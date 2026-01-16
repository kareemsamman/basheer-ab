import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, CreditCard, Loader2, ImageIcon, X, AlertCircle, Upload, ChevronLeft, ChevronRight, RotateCcw, Split, Banknote, Wallet, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { TranzilaPaymentModal } from "@/components/payments/TranzilaPaymentModal";
import type { Enums } from "@/integrations/supabase/types";
import { sanitizeChequeNumber, CHEQUE_NUMBER_MAX_LENGTH } from "@/lib/chequeUtils";

interface PaymentImage {
  id: string;
  image_url: string;
  image_type: string;
}

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  payment_date: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  cheque_status: string | null;
  refused: boolean | null;
  notes: string | null;
  images?: PaymentImage[];
}

interface PolicyPaymentsSectionProps {
  policyId: string;
  payments: Payment[];
  insurancePrice: number;
  onPaymentsChange: () => void;
  autoOpenAdd?: boolean;
  onAutoOpenHandled?: () => void;
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

const paymentTypeLabels: Record<string, string> = {
  "cash": "نقدي",
  "cheque": "شيك",
  "visa": "فيزا",
  "transfer": "تحويل",
};

const paymentTypes = [
  { value: 'cash', label: 'نقدي', icon: Banknote },
  { value: 'cheque', label: 'شيك', icon: CreditCard },
  { value: 'transfer', label: 'تحويل', icon: Wallet },
  { value: 'visa', label: 'بطاقة ائتمان', icon: CreditCard },
];

const chequeStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "قيد الانتظار", variant: "secondary" },
  cashed: { label: "تم صرفه", variant: "default" },
  returned: { label: "مرتجع", variant: "destructive" },
};

export function PolicyPaymentsSection({ 
  policyId, 
  payments, 
  insurancePrice,
  onPaymentsChange,
  autoOpenAdd,
  onAutoOpenHandled 
}: PolicyPaymentsSectionProps) {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tranzilaEnabled, setTranzilaEnabled] = useState(false);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);

  // Multi-line payment states
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [activeVisaPaymentIndex, setActiveVisaPaymentIndex] = useState<number | null>(null);
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [previewUrls, setPreviewUrls] = useState<PreviewUrls>({});

  // Edit form state (for single payment edit)
  const [editFormData, setEditFormData] = useState({
    amount: "",
    payment_type: "cash",
    payment_date: new Date().toISOString().split('T')[0],
    cheque_number: "",
    refused: false,
    notes: "",
  });
  const [editValidationError, setEditValidationError] = useState<string | null>(null);
  const [editPendingImages, setEditPendingImages] = useState<File[]>([]);
  const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Calculate totals
  const totalPaid = payments.filter(p => !p.refused).reduce((sum, p) => sum + p.amount, 0);
  const remaining = insurancePrice - totalPaid;

  // Calculate payment lines total
  const paidVisaTotal = paymentLines
    .filter(p => p.paymentType === 'visa' && p.tranzilaPaid)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const pendingPaymentsTotal = paymentLines
    .filter(p => !(p.paymentType === 'visa' && p.tranzilaPaid))
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const totalPaymentAmount = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);
  const effectiveRemaining = remaining - paidVisaTotal;
  const isOverpaying = pendingPaymentsTotal > effectiveRemaining;
  
  const isValid = paymentLines.length > 0 && 
    totalPaymentAmount > 0 && 
    !isOverpaying &&
    paymentLines.every(p => {
      if (p.paymentType === 'cheque' && !p.chequeNumber?.trim()) return false;
      if (p.paymentType === 'visa' && !p.tranzilaPaid && p.amount <= 0) return false;
      return p.amount > 0;
    });

  // Check if Tranzila is enabled
  useEffect(() => {
    const checkTranzila = async () => {
      try {
        const { data } = await supabase
          .from('payment_settings')
          .select('is_enabled')
          .eq('provider', 'tranzila')
          .single();
        setTranzilaEnabled(data?.is_enabled || false);
      } catch {
        setTranzilaEnabled(false);
      }
    };
    checkTranzila();
  }, []);

  // Auto-open add dialog when triggered from parent
  useEffect(() => {
    if (autoOpenAdd) {
      openAddDialog();
      onAutoOpenHandled?.();
    }
  }, [autoOpenAdd, onAutoOpenHandled]);

  const openAddDialog = () => {
    const initialAmount = remaining > 0 ? remaining : 0;
    setPaymentLines([{
      id: crypto.randomUUID(),
      amount: initialAmount,
      paymentType: 'cash',
      paymentDate: new Date().toISOString().split('T')[0],
    }]);
    setPreviewUrls({});
    setAddDialogOpen(true);
  };

  const resetAddForm = () => {
    Object.values(previewUrls).flat().forEach(url => URL.revokeObjectURL(url));
    setPaymentLines([]);
    setPreviewUrls({});
  };

  // Multi-line payment functions
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
      // Clean up preview URLs for this payment
      const urls = previewUrls[id] || [];
      urls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setPaymentLines(paymentLines.filter(p => p.id !== id));
    }
  };

  const updatePaymentLine = (id: string, field: keyof PaymentLine, value: any) => {
    setPaymentLines(paymentLines.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSplitPayments = () => {
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
    
    // Clean up old preview URLs
    Object.values(previewUrls).flat().forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls({});
    setPaymentLines(newPayments);
    setSplitPopoverOpen(false);
  };

  // Image handling for multi-line payments
  const handleImageSelect = (paymentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({ title: "خطأ", description: "يرجى اختيار صور فقط", variant: "destructive" });
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "خطأ", description: "حجم الصورة يجب أن يكون أقل من 10MB", variant: "destructive" });
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

  // Visa payment handling
  const handleVisaPayClick = (index: number) => {
    const payment = paymentLines[index];
    if (!payment || payment.amount <= 0) return;
    
    if (!tranzilaEnabled) {
      toast({ title: "خطأ", description: "الدفع بالبطاقة غير مفعل", variant: "destructive" });
      return;
    }

    setActiveVisaPaymentIndex(index);
    setTranzilaModalOpen(true);
  };

  const handleTranzilaSuccess = () => {
    setTranzilaModalOpen(false);
    
    if (activeVisaPaymentIndex !== null) {
      updatePaymentLine(paymentLines[activeVisaPaymentIndex].id, 'tranzilaPaid', true);
    }
    
    setActiveVisaPaymentIndex(null);
  };

  const handleTranzilaFailure = () => {
    setTranzilaModalOpen(false);
    setActiveVisaPaymentIndex(null);
  };

  // Upload images helper
  const uploadPaymentImages = async (paymentId: string, files: File[]): Promise<void> => {
    if (files.length === 0) return;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'payment');
      formData.append('entity_id', paymentId);

      try {
        const { data, error } = await supabase.functions.invoke('upload-media', {
          body: formData,
        });

        if (!error && (data?.file?.cdn_url || data?.url)) {
          const cdnUrl = data.file?.cdn_url || data.url;
          const imageType = i === 0 ? 'front' : i === 1 ? 'back' : 'receipt';
          await supabase.from('payment_images').insert({
            payment_id: paymentId,
            image_url: cdnUrl,
            image_type: imageType,
            sort_order: i,
          });
        }
      } catch (err) {
        console.error('Error uploading payment image:', err);
      }
    }
  };

  // Submit multi-line payments
  const handleAddMultiPayments = async () => {
    if (!isValid) return;

    // Check for unpaid visa payments
    const unpaidVisaPayments = paymentLines.filter(p => p.paymentType === 'visa' && !p.tranzilaPaid);
    if (unpaidVisaPayments.length > 0) {
      toast({ title: "تنبيه", description: "يرجى إتمام الدفع بالبطاقة أولاً", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      for (const paymentLine of paymentLines) {
        // Skip already paid visa payments
        if (paymentLine.paymentType === 'visa' && paymentLine.tranzilaPaid) {
          continue;
        }

        const { data, error } = await supabase
          .from('policy_payments')
          .insert({
            policy_id: policyId,
            amount: paymentLine.amount,
            payment_type: paymentLine.paymentType as Enums<'payment_type'>,
            payment_date: paymentLine.paymentDate,
            cheque_number: paymentLine.paymentType === 'cheque' ? paymentLine.chequeNumber : null,
            cheque_status: paymentLine.paymentType === 'cheque' ? 'pending' : null,
            refused: false,
            notes: paymentLine.notes || null,
          })
          .select('id')
          .single();

        if (error) throw error;

        // Upload images if any
        if (paymentLine.pendingImages && paymentLine.pendingImages.length > 0 && data) {
          await uploadPaymentImages(data.id, paymentLine.pendingImages);
        }
      }

      toast({ title: "تمت الإضافة", description: `تمت إضافة ${paymentLines.length} دفعة بنجاح` });
      setAddDialogOpen(false);
      resetAddForm();
      onPaymentsChange();
    } catch (error: any) {
      console.error('Error adding payments:', error);
      if (error.message?.includes('Payment total exceeds')) {
        toast({ title: "خطأ في الدفعة", description: "مجموع الدفعات يتجاوز سعر التأمين.", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: "فشل في إضافة الدفعات", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  // Edit payment functions
  const resetEditForm = () => {
    setEditFormData({
      amount: "",
      payment_type: "cash",
      payment_date: new Date().toISOString().split('T')[0],
      cheque_number: "",
      refused: false,
      notes: "",
    });
    setEditValidationError(null);
    editPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    setEditPendingImages([]);
    setEditPreviewUrls([]);
  };

  const handleEditImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({ title: "خطأ", description: "يرجى اختيار صور فقط", variant: "destructive" });
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "خطأ", description: "حجم الصورة يجب أن يكون أقل من 10MB", variant: "destructive" });
        return false;
      }
      return true;
    });

    setEditPendingImages(prev => [...prev, ...validFiles]);
    validFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      setEditPreviewUrls(prev => [...prev, url]);
    });
  };

  const removeEditImage = (index: number) => {
    URL.revokeObjectURL(editPreviewUrls[index]);
    setEditPendingImages(prev => prev.filter((_, i) => i !== index));
    setEditPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const validateEditPayment = (amount: number, currentPaymentId?: string): boolean => {
    if (editFormData.refused) {
      setEditValidationError(null);
      return true;
    }

    let otherPaymentsTotal = payments
      .filter(p => !p.refused && p.id !== currentPaymentId)
      .reduce((sum, p) => sum + p.amount, 0);
    
    const newTotal = otherPaymentsTotal + amount;
    
    if (newTotal > insurancePrice) {
      const maxAllowed = insurancePrice - otherPaymentsTotal;
      setEditValidationError(`المبلغ يتجاوز سعر التأمين! الحد الأقصى المسموح: ₪${maxAllowed.toLocaleString('ar-EG')}`);
      return false;
    }
    
    setEditValidationError(null);
    return true;
  };

  const handleEditAmountChange = (value: string) => {
    setEditFormData(f => ({ ...f, amount: value }));
    const amount = parseFloat(value) || 0;
    if (amount > 0) {
      validateEditPayment(amount, selectedPayment?.id);
    } else {
      setEditValidationError(null);
    }
  };

  const handleEdit = async () => {
    if (!selectedPayment) return;
    const amount = parseFloat(editFormData.amount) || 0;
    if (amount <= 0) {
      toast({ title: "خطأ", description: "الرجاء إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    if (!validateEditPayment(amount, selectedPayment.id)) return;

    if (editFormData.payment_type === 'cheque' && !editFormData.cheque_number.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال رقم الشيك", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('policy_payments')
        .update({
          amount: amount,
          payment_type: editFormData.payment_type as Enums<'payment_type'>,
          payment_date: editFormData.payment_date,
          cheque_number: editFormData.payment_type === 'cheque' ? editFormData.cheque_number : null,
          refused: editFormData.refused,
          notes: editFormData.notes || null,
        })
        .eq('id', selectedPayment.id);

      if (error) throw error;

      // Upload new images if any
      if (editPendingImages.length > 0) {
        setUploadingImages(true);
        await uploadPaymentImages(selectedPayment.id, editPendingImages);
        setUploadingImages(false);
      }

      toast({ title: "تم التحديث", description: "تم تحديث الدفعة بنجاح" });
      setEditDialogOpen(false);
      setSelectedPayment(null);
      resetEditForm();
      onPaymentsChange();
    } catch (error: any) {
      console.error('Error updating payment:', error);
      if (error.message?.includes('Payment total exceeds')) {
        toast({ title: "خطأ في الدفعة", description: "مجموع الدفعات يتجاوز سعر التأمين.", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: "فشل في تحديث الدفعة", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPayment) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('policy_payments')
        .delete()
        .eq('id', selectedPayment.id);

      if (error) throw error;

      toast({ title: "تم الحذف", description: "تم حذف الدفعة بنجاح" });
      setDeleteDialogOpen(false);
      setSelectedPayment(null);
      onPaymentsChange();
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast({ title: "خطأ", description: "فشل في حذف الدفعة", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openEditDialog = (payment: Payment) => {
    setSelectedPayment(payment);
    setEditFormData({
      amount: payment.amount.toString(),
      payment_type: payment.payment_type,
      payment_date: payment.payment_date,
      cheque_number: payment.cheque_number || "",
      refused: payment.refused || false,
      notes: payment.notes || "",
    });
    setEditValidationError(null);
    setEditPendingImages([]);
    setEditPreviewUrls([]);
    setEditDialogOpen(true);
  };

  // Image gallery for existing payments
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const openGallery = (payment: Payment) => {
    const imgs: string[] = [];
    if (payment.cheque_image_url) imgs.push(payment.cheque_image_url);
    if (payment.images) {
      payment.images.forEach(img => {
        if (!imgs.includes(img.image_url)) imgs.push(img.image_url);
      });
    }
    if (imgs.length > 0) {
      setGalleryImages(imgs);
      setGalleryIndex(0);
      setGalleryOpen(true);
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ar-EG');
  const formatCurrency = (amount: number) => `₪${amount.toLocaleString('ar-EG', { maximumFractionDigits: 0 })}`;

  const getImageCount = (payment: Payment) => {
    let count = payment.cheque_image_url ? 1 : 0;
    count += payment.images?.length || 0;
    return count;
  };

  const activeVisaPayment = activeVisaPaymentIndex !== null ? paymentLines[activeVisaPaymentIndex] : null;

  return (
    <>
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <CreditCard className="h-4 w-4" />
            <span>سجل الدفعات ({payments.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={openAddDialog}>
            <Plus className="h-4 w-4 ml-1" />
            إضافة دفعة
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="bg-muted/50 rounded-lg p-2">
            <p className="text-muted-foreground text-xs">سعر التأمين</p>
            <p className="font-bold">{formatCurrency(insurancePrice)}</p>
          </div>
          <div className="bg-success/10 rounded-lg p-2">
            <p className="text-muted-foreground text-xs">المدفوع</p>
            <p className="font-bold text-success">{formatCurrency(totalPaid)}</p>
          </div>
          <div className={cn("rounded-lg p-2", remaining > 0 ? "bg-destructive/10" : "bg-success/10")}>
            <p className="text-muted-foreground text-xs">المتبقي</p>
            <p className={cn("font-bold", remaining > 0 ? "text-destructive" : "text-success")}>
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

        {payments.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">لا توجد دفعات مسجلة</p>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  payment.refused || payment.cheque_status === 'returned' 
                    ? "bg-destructive/5 border-destructive/20" 
                    : "bg-muted/30"
                )}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <p className="font-bold">{formatCurrency(payment.amount)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(payment.payment_date)}</p>
                  </div>
                  <Badge variant="secondary">{paymentTypeLabels[payment.payment_type]}</Badge>
                  {payment.cheque_number && (
                    <span className="text-xs text-muted-foreground font-mono">#{payment.cheque_number}</span>
                  )}
                  {payment.payment_type === 'cheque' && payment.cheque_status && (
                    <Badge variant={chequeStatusLabels[payment.cheque_status]?.variant || 'secondary'}>
                      {chequeStatusLabels[payment.cheque_status]?.label || payment.cheque_status}
                    </Badge>
                  )}
                  {payment.refused && (
                    <Badge variant="destructive">راجع</Badge>
                  )}
                  {getImageCount(payment) > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 px-2 gap-1 border-primary/50 text-primary hover:bg-primary/10" 
                      onClick={() => openGallery(payment)}
                    >
                      <ImageIcon className="h-3 w-3" />
                      <span className="text-xs">{getImageCount(payment)} صور</span>
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(payment)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      setSelectedPayment(payment);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Multi-Payment Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetAddForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة دفعات</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-muted-foreground text-xs">سعر التأمين</p>
                <p className="font-bold">{formatCurrency(insurancePrice)}</p>
              </div>
              <div className="bg-success/10 rounded-lg p-2">
                <p className="text-muted-foreground text-xs">المدفوع</p>
                <p className="font-bold text-success">{formatCurrency(totalPaid + paidVisaTotal)}</p>
              </div>
              <div className={cn("rounded-lg p-2", effectiveRemaining > 0 ? "bg-destructive/10" : "bg-success/10")}>
                <p className="text-muted-foreground text-xs">المتبقي</p>
                <p className={cn("font-bold", effectiveRemaining > 0 ? "text-destructive" : "text-success")}>
                  {formatCurrency(effectiveRemaining)}
                </p>
              </div>
            </div>

            {/* Payment Lines Header */}
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">الدفعات</Label>
              <div className="flex items-center gap-2">
                <Popover open={splitPopoverOpen} onOpenChange={setSplitPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" disabled={remaining <= 0}>
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

            {/* Payment Lines */}
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
                        placeholder={`أقصى: ${formatCurrency(effectiveRemaining)}`}
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
                        disabled={payment.tranzilaPaid}
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

                  {/* Image Upload for Cheque/Transfer */}
                  {(payment.paymentType === 'cheque' || payment.paymentType === 'transfer') && (
                    <div className="pt-3 border-t border-border/50">
                      <Label className="text-xs text-muted-foreground mb-2 block">
                        {payment.paymentType === 'cheque' ? 'صور الشيك' : 'صور إيصال التحويل'}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {getPreviewUrls(payment.id).map((url, imgIndex) => (
                          <div key={imgIndex} className="relative group">
                            <img src={url} alt="" className="h-14 w-18 object-cover rounded border" />
                            <button
                              type="button"
                              onClick={() => removeImage(payment.id, imgIndex)}
                              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <label className="h-14 w-18 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            onChange={(e) => handleImageSelect(payment.id, e)} 
                            className="hidden" 
                          />
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground mt-0.5">إضافة</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}

            {/* Total and Validation */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="font-medium">مجموع الدفعات:</span>
              <span className={cn("text-lg font-bold", isOverpaying && "text-destructive")}>
                {formatCurrency(totalPaymentAmount)}
              </span>
            </div>

            {isOverpaying && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                مجموع الدفعات أكبر من المبلغ المتبقي ({formatCurrency(effectiveRemaining)})
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleAddMultiPayments} disabled={!isValid || saving}>
              {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              إضافة الدفعات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) { resetEditForm(); setSelectedPayment(null); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الدفعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>المبلغ (₪)</Label>
              <Input
                type="number"
                value={editFormData.amount}
                onChange={(e) => handleEditAmountChange(e.target.value)}
                className={cn("ltr-input text-left", editValidationError && "border-destructive")}
              />
              {editValidationError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{editValidationError}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={editFormData.payment_type} onValueChange={(v) => setEditFormData(f => ({ ...f, payment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الدفع</Label>
              <ArabicDatePicker value={editFormData.payment_date} onChange={(v) => setEditFormData(f => ({ ...f, payment_date: v }))} />
            </div>
            {editFormData.payment_type === 'cheque' && (
              <div className="space-y-2">
                <Label>رقم الشيك *</Label>
                <Input
                  value={editFormData.cheque_number}
                  onChange={(e) => setEditFormData(f => ({ ...f, cheque_number: sanitizeChequeNumber(e.target.value) }))}
                  maxLength={CHEQUE_NUMBER_MAX_LENGTH}
                  className="font-mono ltr-input"
                />
              </div>
            )}
            {/* Show existing images */}
            {selectedPayment && getImageCount(selectedPayment) > 0 && (
              <div className="space-y-2">
                <Label>الصور الحالية</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedPayment.cheque_image_url && (
                    <img src={selectedPayment.cheque_image_url} alt="" className="h-12 w-16 object-cover rounded border" />
                  )}
                  {selectedPayment.images?.map((img, i) => (
                    <img key={i} src={img.image_url} alt="" className="h-12 w-16 object-cover rounded border" />
                  ))}
                </div>
              </div>
            )}
            {(editFormData.payment_type === 'cheque' || editFormData.payment_type === 'transfer') && (
              <div className="space-y-2">
                <Label>إضافة صور جديدة</Label>
                <div className="flex flex-wrap gap-2">
                  {editPreviewUrls.map((url, index) => (
                    <div key={index} className="relative group">
                      <img src={url} alt="" className="h-16 w-20 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => removeEditImage(index)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="h-16 w-20 border-2 border-dashed rounded flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <input type="file" accept="image/*" multiple onChange={handleEditImageSelect} className="hidden" />
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </label>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="refused-edit"
                checked={editFormData.refused}
                onChange={(e) => {
                  setEditFormData(f => ({ ...f, refused: e.target.checked }));
                  if (e.target.checked) setEditValidationError(null);
                  else {
                    const amount = parseFloat(editFormData.amount) || 0;
                    if (amount > 0) validateEditPayment(amount, selectedPayment?.id);
                  }
                }}
                className="h-4 w-4"
              />
              <Label htmlFor="refused-edit" className="cursor-pointer">راجع (مرفوض)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            {/* Mark as Returned button - only for cheques */}
            {selectedPayment?.payment_type === 'cheque' && selectedPayment?.cheque_status !== 'returned' && (
              <Button 
                variant="destructive" 
                onClick={async () => {
                  if (!selectedPayment) return;
                  setSaving(true);
                  try {
                    const { error } = await supabase
                      .from('policy_payments')
                      .update({ cheque_status: 'returned', refused: true })
                      .eq('id', selectedPayment.id);
                    if (error) throw error;
                    toast({ title: "تم التحديث", description: "تم تحديد الشيك كمرتجع" });
                    setEditDialogOpen(false);
                    setSelectedPayment(null);
                    resetEditForm();
                    onPaymentsChange();
                  } catch (error) {
                    toast({ title: "خطأ", description: "فشل في تحديث الحالة", variant: "destructive" });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                تحديد كمرتجع
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={saving || uploadingImages || !!editValidationError}>
              {(saving || uploadingImages) && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="حذف الدفعة"
        description={`هل أنت متأكد من حذف هذه الدفعة بقيمة ${selectedPayment ? formatCurrency(selectedPayment.amount) : ''}؟`}
        loading={deleting}
      />

      {/* Image Gallery Dialog */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="sm:max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>معاينة الصور</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Button variant="ghost" size="icon" className="absolute top-2 left-2 z-10" onClick={() => setGalleryOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
            {galleryImages.length > 0 && (
              <img src={galleryImages[galleryIndex]} alt="" className="w-full h-auto max-h-[70vh] object-contain rounded-lg" />
            )}
            {galleryImages.length > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setGalleryIndex(i => (i > 0 ? i - 1 : galleryImages.length - 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {galleryIndex + 1} / {galleryImages.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setGalleryIndex(i => (i < galleryImages.length - 1 ? i + 1 : 0))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Tranzila Payment Modal */}
      {activeVisaPayment && (
        <TranzilaPaymentModal
          open={tranzilaModalOpen}
          onOpenChange={setTranzilaModalOpen}
          policyId={policyId}
          amount={activeVisaPayment.amount}
          paymentDate={activeVisaPayment.paymentDate}
          notes={activeVisaPayment.notes || ''}
          onSuccess={handleTranzilaSuccess}
          onFailure={handleTranzilaFailure}
        />
      )}
    </>
  );
}
