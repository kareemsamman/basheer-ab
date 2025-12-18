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
import { Plus, Pencil, Trash2, CreditCard, Loader2, ImageIcon, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { TranzilaPaymentModal } from "@/components/payments/TranzilaPaymentModal";
import type { Enums } from "@/integrations/supabase/types";

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  payment_date: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  refused: boolean | null;
  notes: string | null;
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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [tranzilaEnabled, setTranzilaEnabled] = useState(false);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  const [pendingTranzilaPayment, setPendingTranzilaPayment] = useState<{
    amount: number;
    date: string;
    notes: string;
  } | null>(null);

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
      // Pre-fill with remaining amount
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
  };

  const validatePayment = (amount: number, isEdit: boolean = false, currentPaymentId?: string): boolean => {
    // If refused, no validation needed for total
    if (formData.refused) {
      setValidationError(null);
      return true;
    }

    // Calculate what the new total would be
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

    if (!validatePayment(amount)) {
      return;
    }

    // If Visa and Tranzila enabled, use Tranzila flow
    if (formData.payment_type === 'visa' && tranzilaEnabled) {
      setPendingTranzilaPayment({
        amount,
        date: formData.payment_date,
        notes: formData.notes,
      });
      setAddDialogOpen(false);
      setTranzilaModalOpen(true);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('policy_payments')
        .insert({
          policy_id: policyId,
          amount: amount,
          payment_type: formData.payment_type as Enums<'payment_type'>,
          payment_date: formData.payment_date,
          cheque_number: formData.payment_type === 'cheque' ? formData.cheque_number : null,
          refused: formData.refused,
          notes: formData.notes || null,
        });

      if (error) throw error;

      toast({ title: "تمت الإضافة", description: "تمت إضافة الدفعة بنجاح" });
      setAddDialogOpen(false);
      resetForm();
      onPaymentsChange();
    } catch (error: any) {
      console.error('Error adding payment:', error);
      const errorMessage = error.message || '';
      if (errorMessage.includes('Payment total exceeds')) {
        toast({ 
          title: "خطأ في الدفعة", 
          description: "مجموع الدفعات يتجاوز سعر التأمين. الرجاء تعديل المبلغ.", 
          variant: "destructive" 
        });
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

    if (!validatePayment(amount, true, selectedPayment.id)) {
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

      toast({ title: "تم التحديث", description: "تم تحديث الدفعة بنجاح" });
      setEditDialogOpen(false);
      setSelectedPayment(null);
      resetForm();
      onPaymentsChange();
    } catch (error: any) {
      console.error('Error updating payment:', error);
      const errorMessage = error.message || '';
      if (errorMessage.includes('Payment total exceeds')) {
        toast({ 
          title: "خطأ في الدفعة", 
          description: "مجموع الدفعات يتجاوز سعر التأمين. الرجاء تعديل المبلغ.", 
          variant: "destructive" 
        });
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
    setEditDialogOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG');
  };

  const formatCurrency = (amount: number) => {
    return `₪${amount.toLocaleString('ar-EG')}`;
  };

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
            // Pre-fill with remaining amount if there's any
            if (remaining > 0) {
              setFormData(f => ({ ...f, amount: remaining.toString() }));
            }
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
                  payment.refused ? "bg-destructive/5 border-destructive/20" : "bg-muted/30"
                )}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-bold">{formatCurrency(payment.amount)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(payment.payment_date)}</p>
                  </div>
                  <Badge variant="secondary">{paymentTypeLabels[payment.payment_type]}</Badge>
                  {payment.cheque_number && (
                    <span className="text-xs text-muted-foreground">#{payment.cheque_number}</span>
                  )}
                  {payment.refused && (
                    <Badge variant="destructive">راجع</Badge>
                  )}
                  {payment.cheque_image_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setImagePreview(payment.cheque_image_url)}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(payment)}
                  >
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
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        setAddDialogOpen(open);
        if (!open) resetForm();
      }}>
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
                dir="ltr"
                className={cn("text-left", validationError && "border-destructive")}
              />
              {validationError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{validationError}</span>
                </div>
              )}
              {remaining > 0 && !validationError && (
                <p className="text-xs text-muted-foreground">المتبقي من سعر التأمين: {formatCurrency(remaining)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select
                value={formData.payment_type}
                onValueChange={(v) => setFormData(f => ({ ...f, payment_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الدفع</Label>
              <ArabicDatePicker
                value={formData.payment_date}
                onChange={(v) => setFormData(f => ({ ...f, payment_date: v }))}
              />
            </div>
            {formData.payment_type === 'cheque' && (
              <div className="space-y-2">
                <Label>رقم الشيك</Label>
                <Input
                  value={formData.cheque_number}
                  onChange={(e) => setFormData(f => ({ ...f, cheque_number: e.target.value }))}
                  dir="ltr"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="refused-add"
                checked={formData.refused}
                onChange={(e) => {
                  setFormData(f => ({ ...f, refused: e.target.checked }));
                  // Re-validate when refused changes
                  if (e.target.checked) {
                    setValidationError(null);
                  } else {
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
            <Button onClick={handleAdd} disabled={saving || !!validationError}>
              {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          resetForm();
          setSelectedPayment(null);
        }
      }}>
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
                dir="ltr"
                className={cn("text-left", validationError && "border-destructive")}
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
              <Select
                value={formData.payment_type}
                onValueChange={(v) => setFormData(f => ({ ...f, payment_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الدفع</Label>
              <ArabicDatePicker
                value={formData.payment_date}
                onChange={(v) => setFormData(f => ({ ...f, payment_date: v }))}
              />
            </div>
            {formData.payment_type === 'cheque' && (
              <div className="space-y-2">
                <Label>رقم الشيك</Label>
                <Input
                  value={formData.cheque_number}
                  onChange={(e) => setFormData(f => ({ ...f, cheque_number: e.target.value }))}
                  dir="ltr"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="refused-edit"
                checked={formData.refused}
                onChange={(e) => {
                  setFormData(f => ({ ...f, refused: e.target.checked }));
                  if (e.target.checked) {
                    setValidationError(null);
                  } else {
                    const amount = parseFloat(formData.amount) || 0;
                    if (amount > 0) validatePayment(amount, true, selectedPayment?.id);
                  }
                }}
                className="h-4 w-4"
              />
              <Label htmlFor="refused-edit" className="cursor-pointer">راجع (مرفوض)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={saving || !!validationError}>
              {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
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

      {/* Image Preview Dialog */}
      {imagePreview && (
        <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
          <DialogContent className="sm:max-w-2xl p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>معاينة صورة الشيك</DialogTitle>
            </DialogHeader>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 left-2 z-10"
              onClick={() => setImagePreview(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <img
              src={imagePreview}
              alt="صورة الشيك"
              className="w-full h-auto rounded-lg"
            />
          </DialogContent>
        </Dialog>
      )}

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
