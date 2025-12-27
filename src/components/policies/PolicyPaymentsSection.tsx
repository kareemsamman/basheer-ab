import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, CreditCard, Loader2, ImageIcon, X, AlertCircle, Upload, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
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

const paymentTypeLabels: Record<string, string> = {
  "cash": "نقدي",
  "cheque": "شيك",
  "visa": "فيزا",
  "transfer": "تحويل",
};

const PAYMENT_TYPES = [
  { value: "cash", label: "نقدي" },
  { value: "cheque", label: "شيك" },
  { value: "visa", label: "فيزا" },
  { value: "transfer", label: "تحويل" },
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [tranzilaEnabled, setTranzilaEnabled] = useState(false);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  const [pendingTranzilaPayment, setPendingTranzilaPayment] = useState<{
    amount: number;
    date: string;
    notes: string;
  } | null>(null);

  // Image handling states
  const [uploadingImages, setUploadingImages] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const [formData, setFormData] = useState({
    amount: "",
    payment_type: "cash",
    payment_date: new Date().toISOString().split('T')[0],
    cheque_number: "",
    refused: false,
    notes: "",
  });

  // Calculate total paid (excluding refused)
  const totalPaid = payments.filter(p => !p.refused).reduce((sum, p) => sum + p.amount, 0);
  const remaining = insurancePrice - totalPaid;

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
      setAddDialogOpen(true);
      setFormData(f => ({ ...f, amount: remaining > 0 ? remaining.toString() : "" }));
      onAutoOpenHandled?.();
    }
  }, [autoOpenAdd, remaining, onAutoOpenHandled]);

  const resetForm = () => {
    setFormData({
      amount: "",
      payment_type: "cash",
      payment_date: new Date().toISOString().split('T')[0],
      cheque_number: "",
      refused: false,
      notes: "",
    });
    setValidationError(null);
    // Clear images
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPendingImages([]);
    setPreviewUrls([]);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setPendingImages(prev => [...prev, ...validFiles]);
    validFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      setPreviewUrls(prev => [...prev, url]);
    });
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setPendingImages(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async (paymentId: string): Promise<void> => {
    if (pendingImages.length === 0) return;
    
    setUploadingImages(true);
    try {
      for (let i = 0; i < pendingImages.length; i++) {
        const file = pendingImages[i];
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);
        uploadFormData.append('entity_type', 'payment');
        uploadFormData.append('entity_id', paymentId);
        
        const { data, error } = await supabase.functions.invoke('upload-media', {
          body: uploadFormData,
        });
        
        if (error) throw error;
        
        // Get the CDN URL from the response - upload-media returns { success, file: { cdn_url, ... } }
        const cdnUrl = data.file?.cdn_url || data.url;
        if (!cdnUrl) {
          throw new Error('No URL returned from upload');
        }
        
        const imageType = i === 0 ? 'front' : i === 1 ? 'back' : 'receipt';
        await supabase.from('payment_images').insert({
          payment_id: paymentId,
          image_url: cdnUrl,
          image_type: imageType,
          sort_order: i,
        });
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({ title: "تحذير", description: "تم حفظ الدفعة لكن فشل رفع بعض الصور", variant: "destructive" });
    } finally {
      setUploadingImages(false);
    }
  };

  const validatePayment = (amount: number, isEdit: boolean = false, currentPaymentId?: string): boolean => {
    if (formData.refused) {
      setValidationError(null);
      return true;
    }

    let otherPaymentsTotal = payments
      .filter(p => !p.refused && (isEdit ? p.id !== currentPaymentId : true))
      .reduce((sum, p) => sum + p.amount, 0);
    
    const newTotal = otherPaymentsTotal + amount;
    
    if (newTotal > insurancePrice) {
      const maxAllowed = insurancePrice - otherPaymentsTotal;
      setValidationError(`المبلغ يتجاوز سعر التأمين! الحد الأقصى المسموح: ₪${maxAllowed.toLocaleString('ar-EG')}`);
      return false;
    }
    
    setValidationError(null);
    return true;
  };

  const handleAmountChange = (value: string, isEdit: boolean = false, currentPaymentId?: string) => {
    setFormData(f => ({ ...f, amount: value }));
    const amount = parseFloat(value) || 0;
    if (amount > 0) {
      validatePayment(amount, isEdit, currentPaymentId);
    } else {
      setValidationError(null);
    }
  };

  const handleAdd = async () => {
    const amount = parseFloat(formData.amount) || 0;
    if (amount <= 0) {
      toast({ title: "خطأ", description: "الرجاء إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    if (!validatePayment(amount)) return;

    // Validate cheque number
    if (formData.payment_type === 'cheque' && !formData.cheque_number.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال رقم الشيك", variant: "destructive" });
      return;
    }

    // Tranzila flow for Visa
    if (formData.payment_type === 'visa' && tranzilaEnabled) {
      setPendingTranzilaPayment({ amount, date: formData.payment_date, notes: formData.notes });
      setAddDialogOpen(false);
      setTranzilaModalOpen(true);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('policy_payments')
        .insert({
          policy_id: policyId,
          amount: amount,
          payment_type: formData.payment_type as Enums<'payment_type'>,
          payment_date: formData.payment_date,
          cheque_number: formData.payment_type === 'cheque' ? formData.cheque_number : null,
          cheque_status: formData.payment_type === 'cheque' ? 'pending' : null,
          refused: formData.refused,
          notes: formData.notes || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Upload images if any
      if (pendingImages.length > 0 && data) {
        await uploadImages(data.id);
      }

      toast({ title: "تمت الإضافة", description: "تمت إضافة الدفعة بنجاح" });
      setAddDialogOpen(false);
      resetForm();
      onPaymentsChange();
    } catch (error: any) {
      console.error('Error adding payment:', error);
      if (error.message?.includes('Payment total exceeds')) {
        toast({ title: "خطأ في الدفعة", description: "مجموع الدفعات يتجاوز سعر التأمين.", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: "فشل في إضافة الدفعة", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTranzilaSuccess = () => {
    resetForm();
    setPendingTranzilaPayment(null);
    onPaymentsChange();
  };

  const handleTranzilaFailure = () => {
    setPendingTranzilaPayment(null);
  };

  const handleEdit = async () => {
    if (!selectedPayment) return;
    const amount = parseFloat(formData.amount) || 0;
    if (amount <= 0) {
      toast({ title: "خطأ", description: "الرجاء إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    if (!validatePayment(amount, true, selectedPayment.id)) return;

    if (formData.payment_type === 'cheque' && !formData.cheque_number.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال رقم الشيك", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('policy_payments')
        .update({
          amount: amount,
          payment_type: formData.payment_type as Enums<'payment_type'>,
          payment_date: formData.payment_date,
          cheque_number: formData.payment_type === 'cheque' ? formData.cheque_number : null,
          refused: formData.refused,
          notes: formData.notes || null,
        })
        .eq('id', selectedPayment.id);

      if (error) throw error;

      // Upload new images if any
      if (pendingImages.length > 0) {
        await uploadImages(selectedPayment.id);
      }

      toast({ title: "تم التحديث", description: "تم تحديث الدفعة بنجاح" });
      setEditDialogOpen(false);
      setSelectedPayment(null);
      resetForm();
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
    setFormData({
      amount: payment.amount.toString(),
      payment_type: payment.payment_type,
      payment_date: payment.payment_date,
      cheque_number: payment.cheque_number || "",
      refused: payment.refused || false,
      notes: payment.notes || "",
    });
    setValidationError(null);
    setPendingImages([]);
    setPreviewUrls([]);
    setEditDialogOpen(true);
  };

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
  const formatCurrency = (amount: number) => `₪${amount.toLocaleString('ar-EG')}`;

  const getImageCount = (payment: Payment) => {
    let count = payment.cheque_image_url ? 1 : 0;
    count += payment.images?.length || 0;
    return count;
  };

  const renderImageUpload = () => (
    <div className="space-y-2">
      <Label>
        {formData.payment_type === 'cheque' ? 'صور الشيك (أمامي/خلفي)' : 'صور إيصال التحويل'}
      </Label>
      <div className="flex flex-wrap gap-2">
        {previewUrls.map((url, index) => (
          <div key={index} className="relative group">
            <img src={url} alt="" className="h-16 w-20 object-cover rounded border" />
            <button
              type="button"
              onClick={() => removeImage(index)}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="h-16 w-20 border-2 border-dashed rounded flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
          <input type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
          <Upload className="h-5 w-5 text-muted-foreground" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {formData.payment_type === 'cheque' 
          ? 'يمكنك إضافة صورة الوجه الأمامي والخلفي للشيك' 
          : 'يمكنك إضافة صور إيصالات التحويل'}
      </p>
    </div>
  );

  return (
    <>
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <CreditCard className="h-4 w-4" />
            <span>سجل الدفعات ({payments.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            resetForm();
            if (remaining > 0) setFormData(f => ({ ...f, amount: remaining.toString() }));
            setAddDialogOpen(true);
          }}>
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

      {/* Add Payment Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة دفعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>المبلغ (₪)</Label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className={cn("ltr-input text-left", validationError && "border-destructive")}
              />
              {validationError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{validationError}</span>
                </div>
              )}
              {remaining > 0 && !validationError && (
                <p className="text-xs text-muted-foreground">المتبقي: {formatCurrency(remaining)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={formData.payment_type} onValueChange={(v) => setFormData(f => ({ ...f, payment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الدفع</Label>
              <ArabicDatePicker value={formData.payment_date} onChange={(v) => setFormData(f => ({ ...f, payment_date: v }))} />
            </div>
            {formData.payment_type === 'cheque' && (
              <div className="space-y-2">
                <Label>رقم الشيك *</Label>
                <Input
                  value={formData.cheque_number}
                  onChange={(e) => setFormData(f => ({ ...f, cheque_number: sanitizeChequeNumber(e.target.value) }))}
                  placeholder="أدخل رقم الشيك"
                  maxLength={CHEQUE_NUMBER_MAX_LENGTH}
                  className="font-mono ltr-input"
                />
              </div>
            )}
            {(formData.payment_type === 'cheque' || formData.payment_type === 'transfer') && renderImageUpload()}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="refused-add"
                checked={formData.refused}
                onChange={(e) => {
                  setFormData(f => ({ ...f, refused: e.target.checked }));
                  if (e.target.checked) setValidationError(null);
                  else {
                    const amount = parseFloat(formData.amount) || 0;
                    if (amount > 0) validatePayment(amount);
                  }
                }}
                className="h-4 w-4"
              />
              <Label htmlFor="refused-add" className="cursor-pointer">راجع (مرفوض)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={saving || uploadingImages || !!validationError}>
              {(saving || uploadingImages) && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {uploadingImages ? 'جاري رفع الصور...' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) { resetForm(); setSelectedPayment(null); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الدفعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>المبلغ (₪)</Label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => handleAmountChange(e.target.value, true, selectedPayment?.id)}
                className={cn("ltr-input text-left", validationError && "border-destructive")}
              />
              {validationError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{validationError}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={formData.payment_type} onValueChange={(v) => setFormData(f => ({ ...f, payment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الدفع</Label>
              <ArabicDatePicker value={formData.payment_date} onChange={(v) => setFormData(f => ({ ...f, payment_date: v }))} />
            </div>
            {formData.payment_type === 'cheque' && (
              <div className="space-y-2">
                <Label>رقم الشيك *</Label>
                <Input
                  value={formData.cheque_number}
                  onChange={(e) => setFormData(f => ({ ...f, cheque_number: sanitizeChequeNumber(e.target.value) }))}
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
            {(formData.payment_type === 'cheque' || formData.payment_type === 'transfer') && (
              <div className="space-y-2">
                <Label>إضافة صور جديدة</Label>
                {renderImageUpload()}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="refused-edit"
                checked={formData.refused}
                onChange={(e) => {
                  setFormData(f => ({ ...f, refused: e.target.checked }));
                  if (e.target.checked) setValidationError(null);
                  else {
                    const amount = parseFloat(formData.amount) || 0;
                    if (amount > 0) validatePayment(amount, true, selectedPayment?.id);
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
                    resetForm();
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
            <Button onClick={handleEdit} disabled={saving || uploadingImages || !!validationError}>
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
      {pendingTranzilaPayment && (
        <TranzilaPaymentModal
          open={tranzilaModalOpen}
          onOpenChange={setTranzilaModalOpen}
          policyId={policyId}
          amount={pendingTranzilaPayment.amount}
          paymentDate={pendingTranzilaPayment.date}
          notes={pendingTranzilaPayment.notes}
          onSuccess={handleTranzilaSuccess}
          onFailure={handleTranzilaFailure}
        />
      )}
    </>
  );
}