import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { Plus, Trash2, CreditCard, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaymentSummaryBar } from "./PaymentSummaryBar";
import { TranzilaPaymentModal } from "@/components/payments/TranzilaPaymentModal";
import type { PaymentLine, PricingBreakdown, ValidationErrors } from "./types";
import { PAYMENT_TYPES } from "./types";

interface Step4Props {
  payments: PaymentLine[];
  setPayments: (payments: PaymentLine[]) => void;
  pricing: PricingBreakdown;
  totalPaidPayments: number;
  remainingToPay: number;
  paymentsExceedPrice: boolean;
  errors: ValidationErrors;
  policyId?: string; // For Tranzila payments - will be null for new policies
}

export function Step4Payments({
  payments,
  setPayments,
  pricing,
  totalPaidPayments,
  remainingToPay,
  paymentsExceedPrice,
  errors,
  policyId,
}: Step4Props) {
  const [showTranzilaModal, setShowTranzilaModal] = useState(false);
  const [selectedVisaPaymentId, setSelectedVisaPaymentId] = useState<string | null>(null);

  const addPayment = () => {
    setPayments([
      ...payments,
      {
        id: crypto.randomUUID(),
        payment_type: "cash",
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
        refused: false,
      },
    ]);
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter(p => p.id !== id));
  };

  const updatePayment = (id: string, field: string, value: any) => {
    setPayments(payments.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const getPaymentTypeLabel = (type: string) => {
    return PAYMENT_TYPES.find(t => t.value === type)?.label || type;
  };

  const handleVisaPayment = (paymentId: string) => {
    setSelectedVisaPaymentId(paymentId);
    setShowTranzilaModal(true);
  };

  const handleVisaSuccess = () => {
    if (selectedVisaPaymentId) {
      // Mark the payment as paid (in real scenario, this would be handled by webhook)
      updatePayment(selectedVisaPaymentId, 'tranzila_paid', true);
    }
    setShowTranzilaModal(false);
    setSelectedVisaPaymentId(null);
  };

  const handleVisaFailure = () => {
    setShowTranzilaModal(false);
    setSelectedVisaPaymentId(null);
  };

  const selectedVisaPayment = payments.find(p => p.id === selectedVisaPaymentId);

  return (
    <div className="space-y-6">
      {/* Payment Summary Bar - Always Visible */}
      <PaymentSummaryBar
        totalPrice={pricing.totalPrice}
        totalPaid={totalPaidPayments}
        remaining={remainingToPay}
        hasError={paymentsExceedPrice}
      />

      {/* Payments List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">الدفعات</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPayment}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة دفعة
          </Button>
        </div>

        {payments.length === 0 ? (
          <Card className="p-8 text-center bg-muted/30">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">لا توجد دفعات</p>
            <p className="text-xs text-muted-foreground mt-1">يمكنك إضافة دفعات لاحقاً</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {payments.map((payment, index) => {
              const isVisa = payment.payment_type === 'visa';
              const visaPaid = payment.tranzila_paid;
              const visaAmount = payment.amount || 0;
              const canPayVisa = isVisa && visaAmount > 0 && !visaPaid && policyId;
              
              return (
                <Card key={payment.id} className={cn(
                  "p-5",
                  payment.refused && "bg-destructive/5 border-destructive/30",
                  visaPaid && "bg-success/5 border-success/30"
                )}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Payment Type */}
                      <div>
                        <Label className="text-xs mb-1.5 block">نوع الدفع</Label>
                        <Select
                          value={payment.payment_type}
                          onValueChange={(v) => updatePayment(payment.id, 'payment_type', v)}
                        >
                          <SelectTrigger className="h-10">
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
                          onChange={(e) => updatePayment(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className={cn(
                            "h-10",
                            paymentsExceedPrice && "border-destructive"
                          )}
                          max={remainingToPay + payment.amount}
                        />
                        {remainingToPay >= 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            الحد الأقصى: ₪{(remainingToPay + payment.amount).toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* Date */}
                      <div>
                        <Label className="text-xs mb-1.5 block">التاريخ</Label>
                        <ArabicDatePicker
                          value={payment.payment_date}
                          onChange={(date) => updatePayment(payment.id, 'payment_date', date)}
                          className="h-10"
                        />
                      </div>

                      {/* Cheque Number (if cheque) */}
                      {payment.payment_type === 'cheque' && (
                        <div>
                          <Label className="text-xs mb-1.5 block">رقم الشيك</Label>
                          <Input
                            value={payment.cheque_number || ''}
                            onChange={(e) => updatePayment(payment.id, 'cheque_number', e.target.value)}
                            placeholder="رقم الشيك"
                            className="h-10"
                          />
                        </div>
                      )}

                      {/* Visa Payment Button */}
                      {isVisa && (
                        <div className="sm:col-span-2 lg:col-span-4">
                          {visaPaid ? (
                            <div className="flex items-center gap-2 text-success text-sm py-2">
                              <CreditCard className="h-4 w-4" />
                              <span>تم الدفع بنجاح</span>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="default"
                              onClick={() => handleVisaPayment(payment.id)}
                              disabled={!canPayVisa || visaAmount <= 0}
                              className="gap-2 w-full sm:w-auto"
                            >
                              <CreditCard className="h-4 w-4" />
                              {policyId ? (
                                visaAmount > 0 ? `ادفع ₪${visaAmount.toLocaleString()} بالبطاقة` : 'أدخل المبلغ أولاً'
                              ) : (
                                'احفظ الوثيقة أولاً للدفع بالفيزا'
                              )}
                            </Button>
                          )}
                          {!policyId && isVisa && visaAmount > 0 && (
                            <p className="text-xs text-amber-600 mt-1">
                              ملاحظة: سيتم حفظ الدفعة بدون تنفيذ عملية الفيزا. يمكنك الدفع لاحقاً من صفحة الوثيقة.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-center gap-3 pt-6">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePayment(payment.id)}
                        className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      
                      {/* Refused Checkbox */}
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id={`refused-${payment.id}`}
                          checked={payment.refused}
                          onCheckedChange={(v) => updatePayment(payment.id, 'refused', !!v)}
                          className="h-4 w-4"
                        />
                        <Label htmlFor={`refused-${payment.id}`} className="text-xs cursor-pointer">
                          مرفوض
                        </Label>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Error Message */}
        {paymentsExceedPrice && (
          <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>مجموع الدفعات يتجاوز سعر التأمين</span>
          </div>
        )}
      </div>

      {/* Tranzila Payment Modal */}
      {selectedVisaPayment && policyId && (
        <TranzilaPaymentModal
          open={showTranzilaModal}
          onOpenChange={setShowTranzilaModal}
          policyId={policyId}
          amount={selectedVisaPayment.amount || 0}
          paymentDate={selectedVisaPayment.payment_date}
          notes={selectedVisaPayment.notes}
          onSuccess={handleVisaSuccess}
          onFailure={handleVisaFailure}
        />
      )}
    </div>
  );
}
