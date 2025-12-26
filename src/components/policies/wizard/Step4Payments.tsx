import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { Plus, Trash2, CreditCard, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaymentSummaryBar } from "./PaymentSummaryBar";
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
}

export function Step4Payments({
  payments,
  setPayments,
  pricing,
  totalPaidPayments,
  remainingToPay,
  paymentsExceedPrice,
  errors,
}: Step4Props) {
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
          <Card className="p-6 text-center">
            <CreditCard className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد دفعات</p>
            <p className="text-xs text-muted-foreground mt-1">يمكنك إضافة دفعات لاحقاً</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {payments.map((payment, index) => (
              <Card key={payment.id} className={cn(
                "p-4",
                payment.refused && "bg-destructive/5 border-destructive/30"
              )}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {/* Payment Type */}
                    <div>
                      <Label className="text-xs">نوع الدفع</Label>
                      <Select
                        value={payment.payment_type}
                        onValueChange={(v) => updatePayment(payment.id, 'payment_type', v)}
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
                      <Label className="text-xs">المبلغ (₪)</Label>
                      <Input
                        type="number"
                        value={payment.amount || ''}
                        onChange={(e) => updatePayment(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className={cn(
                          "h-9",
                          paymentsExceedPrice && "border-destructive"
                        )}
                        max={remainingToPay + payment.amount}
                      />
                      {remainingToPay >= 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          الحد الأقصى: ₪{(remainingToPay + payment.amount).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Date */}
                    <div>
                      <Label className="text-xs">التاريخ</Label>
                      <ArabicDatePicker
                        value={payment.payment_date}
                        onChange={(date) => updatePayment(payment.id, 'payment_date', date)}
                        className="h-9"
                      />
                    </div>

                    {/* Cheque Number (if cheque) */}
                    {payment.payment_type === 'cheque' && (
                      <div>
                        <Label className="text-xs">رقم الشيك</Label>
                        <Input
                          value={payment.cheque_number || ''}
                          onChange={(e) => updatePayment(payment.id, 'cheque_number', e.target.value)}
                          placeholder="رقم الشيك"
                          className="h-9"
                        />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-center gap-2 pt-5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePayment(payment.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    
                    {/* Refused Checkbox */}
                    <div className="flex items-center gap-1">
                      <Checkbox
                        id={`refused-${payment.id}`}
                        checked={payment.refused}
                        onCheckedChange={(v) => updatePayment(payment.id, 'refused', !!v)}
                      />
                      <Label htmlFor={`refused-${payment.id}`} className="text-xs cursor-pointer">
                        مرفوض
                      </Label>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Error Message */}
        {paymentsExceedPrice && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>مجموع الدفعات يتجاوز سعر التأمين</span>
          </div>
        )}
      </div>
    </div>
  );
}
