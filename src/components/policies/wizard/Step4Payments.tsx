import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { Plus, Trash2, CreditCard, AlertCircle } from "lucide-react";
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
  onVisaPaymentRequired: () => boolean; // Returns true if visa is required and not paid
}

export function Step4Payments({
  payments,
  setPayments,
  pricing,
  totalPaidPayments,
  remainingToPay,
  paymentsExceedPrice,
  errors,
  onVisaPaymentRequired,
}: Step4Props) {
  const [showTranzilaModal, setShowTranzilaModal] = useState(false);
  const [selectedVisaPaymentIndex, setSelectedVisaPaymentIndex] = useState<number | null>(null);

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

  const handleVisaPayClick = (index: number) => {
    setSelectedVisaPaymentIndex(index);
    setShowTranzilaModal(true);
  };

  const handleVisaSuccess = () => {
    if (selectedVisaPaymentIndex !== null) {
      const payment = payments[selectedVisaPaymentIndex];
      if (payment) {
        updatePayment(payment.id, 'tranzila_paid', true);
      }
    }
    setShowTranzilaModal(false);
    setSelectedVisaPaymentIndex(null);
  };

  const handleVisaFailure = () => {
    // On failure, remove the visa payment
    if (selectedVisaPaymentIndex !== null) {
      const payment = payments[selectedVisaPaymentIndex];
      if (payment) {
        removePayment(payment.id);
      }
    }
    setShowTranzilaModal(false);
    setSelectedVisaPaymentIndex(null);
  };

  const selectedVisaPayment = selectedVisaPaymentIndex !== null ? payments[selectedVisaPaymentIndex] : null;

  // Check if there are unpaid visa payments
  const hasUnpaidVisa = payments.some(p => p.payment_type === 'visa' && !p.tranzila_paid && (p.amount || 0) > 0);

  return (
    <div className="space-y-6">
      {/* Payment Summary Bar - Always Visible */}
      <PaymentSummaryBar
        totalPrice={pricing.totalPrice}
        totalPaid={totalPaidPayments}
        remaining={remainingToPay}
        hasError={paymentsExceedPrice}
      />

      {/* Unpaid Visa Warning */}
      {hasUnpaidVisa && (
        <div className="flex items-center gap-2 text-amber-600 text-sm p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>يجب الدفع بالفيزا قبل حفظ الوثيقة</span>
        </div>
      )}

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
          <div className="space-y-3">
            {payments.map((payment, index) => {
              const isVisa = payment.payment_type === 'visa';
              const visaPaid = payment.tranzila_paid;
              const visaAmount = payment.amount || 0;
              
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
                        onValueChange={(v) => updatePayment(payment.id, 'payment_type', v)}
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
                        onChange={(e) => updatePayment(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        disabled={visaPaid}
                        className={cn(
                          "h-9",
                          paymentsExceedPrice && "border-destructive"
                        )}
                      />
                    </div>

                    {/* Date */}
                    <div>
                      <Label className="text-xs mb-1.5 block">التاريخ</Label>
                      <ArabicDatePicker
                        value={payment.payment_date}
                        onChange={(date) => updatePayment(payment.id, 'payment_date', date)}
                        className="h-9"
                        disabled={visaPaid}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Cheque Number (if cheque) */}
                      {payment.payment_type === 'cheque' && (
                        <Input
                          value={payment.cheque_number || ''}
                          onChange={(e) => updatePayment(payment.id, 'cheque_number', e.target.value)}
                          placeholder="رقم الشيك"
                          className="h-9 flex-1"
                        />
                      )}
                      
                      {/* Visa Pay Button */}
                      {isVisa && !visaPaid && visaAmount > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleVisaPayClick(index)}
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
                          onClick={() => removePayment(payment.id)}
                          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
      {selectedVisaPayment && (
        <TranzilaPaymentModal
          open={showTranzilaModal}
          onOpenChange={(open) => {
            if (!open) handleVisaFailure();
          }}
          policyId="temp" // Will be created after successful payment
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
