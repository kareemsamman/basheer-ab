import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { FileUploader } from "@/components/media/FileUploader";
import { CustomerChequeSelector, SelectableCheque } from "@/components/shared/CustomerChequeSelector";
import { ChequeScannerDialog } from "@/components/payments/ChequeScannerDialog";
import {
  Plus,
  Trash2,
  Split,
  Scan,
  CreditCard,
  Banknote,
  Building2,
  Receipt,
  FileText,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type PaymentType = 'cash' | 'cheque' | 'bank_transfer' | 'visa' | 'customer_cheque';

export interface PaymentLine {
  id: string;
  payment_type: PaymentType;
  amount: number;
  payment_date: string;
  cheque_number?: string;
  cheque_image_url?: string;
  bank_reference?: string;
  notes?: string;
  selected_cheques?: SelectableCheque[];
}

const PAYMENT_TYPES = [
  { value: 'cash', label: 'نقداً' },
  { value: 'cheque', label: 'شيك جديد' },
  { value: 'customer_cheque', label: 'شيك عميل' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
];

interface ExpensePaymentLinesProps {
  paymentLines: PaymentLine[];
  setPaymentLines: React.Dispatch<React.SetStateAction<PaymentLine[]>>;
  mainReceiptImages: string[];
  setMainReceiptImages: React.Dispatch<React.SetStateAction<string[]>>;
  mainNotes: string;
  setMainNotes: React.Dispatch<React.SetStateAction<string>>;
  entityId: string;
  entityType: 'broker' | 'company';
}

export function ExpensePaymentLines({
  paymentLines,
  setPaymentLines,
  mainReceiptImages,
  setMainReceiptImages,
  mainNotes,
  setMainNotes,
  entityId,
  entityType,
}: ExpensePaymentLinesProps) {
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitAmount, setSplitAmount] = useState('');
  const [chequeScannerOpen, setChequeScannerOpen] = useState(false);

  const addPaymentLine = () => {
    setPaymentLines(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        payment_type: 'cash',
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
      },
    ]);
  };

  const removePaymentLine = (id: string) => {
    setPaymentLines(prev => prev.filter(p => p.id !== id));
  };

  const updatePaymentLine = (id: string, field: string, value: any) => {
    setPaymentLines(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleSplitPayments = () => {
    if (splitCount < 2 || splitCount > 12 || !splitAmount) return;
    const totalAmount = parseFloat(splitAmount) || 0;
    if (totalAmount <= 0) return;

    const amountPerInstallment = Math.floor(totalAmount / splitCount);
    const remainder = totalAmount - (amountPerInstallment * splitCount);
    const today = new Date();
    const newPayments: PaymentLine[] = [];

    for (let i = 0; i < splitCount; i++) {
      const paymentDate = new Date(today);
      paymentDate.setMonth(today.getMonth() + i);
      const amount = i === 0 ? amountPerInstallment + remainder : amountPerInstallment;
      newPayments.push({
        id: crypto.randomUUID(),
        payment_type: 'cash',
        amount,
        payment_date: paymentDate.toISOString().split('T')[0],
      });
    }

    setPaymentLines(newPayments);
    setSplitPopoverOpen(false);
  };

  const handleScannedCheques = (cheques: any[]) => {
    const newPayments: PaymentLine[] = cheques.map(cheque => ({
      id: crypto.randomUUID(),
      payment_type: 'cheque' as PaymentType,
      amount: cheque.amount || 0,
      payment_date: cheque.payment_date || new Date().toISOString().split('T')[0],
      cheque_number: cheque.cheque_number || '',
      cheque_image_url: cheque.image_url || undefined,
    }));

    setPaymentLines(prev => [...prev, ...newPayments]);
    toast.success(`تم إضافة ${newPayments.length} دفعة شيك`);
  };

  const totalPaymentLines = paymentLines.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Payment Lines Header */}
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">الدفعات</Label>
        <div className="flex gap-2">
          <Popover open={splitPopoverOpen} onOpenChange={setSplitPopoverOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <Split className="h-4 w-4" />
                تقسيط
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end" dir="rtl">
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">تقسيط المبلغ</h4>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">المبلغ الإجمالي</Label>
                    <Input
                      type="number"
                      value={splitAmount}
                      onChange={(e) => setSplitAmount(e.target.value)}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">عدد الأقساط (2-12)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={2}
                        max={12}
                        value={splitCount}
                        onChange={(e) => setSplitCount(Math.min(12, Math.max(2, parseInt(e.target.value) || 2)))}
                        className="h-9"
                      />
                      <Button type="button" size="sm" onClick={handleSplitPayments} className="h-9 px-4">
                        تقسيم
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button type="button" variant="outline" size="sm" onClick={() => setChequeScannerOpen(true)} className="gap-2">
            <Scan className="h-4 w-4" />
            مسح شيكات
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={addPaymentLine} className="gap-2">
            <Plus className="h-4 w-4" />
            إضافة دفعة
          </Button>
        </div>
      </div>

      {/* Payment Lines */}
      {paymentLines.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30">
          <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">لا توجد دفعات</p>
          <p className="text-xs text-muted-foreground mt-1">يمكنك إضافة دفعات باستخدام الأزرار أعلاه</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paymentLines.map((payment) => (
            <Card key={payment.id} className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                {/* Payment Type */}
                <div>
                  <Label className="text-xs mb-1.5 block">نوع الدفع</Label>
                  <Select
                    value={payment.payment_type}
                    onValueChange={(v) => {
                      updatePaymentLine(payment.id, 'payment_type', v);
                      if (v === 'customer_cheque') {
                        updatePaymentLine(payment.id, 'amount', 0);
                      }
                    }}
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
                {payment.payment_type !== 'customer_cheque' && (
                  <div>
                    <Label className="text-xs mb-1.5 block">المبلغ (₪)</Label>
                    <Input
                      type="number"
                      value={payment.amount || ''}
                      onChange={(e) => updatePaymentLine(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                )}

                {/* Date */}
                <div>
                  <Label className="text-xs mb-1.5 block">التاريخ</Label>
                  <ArabicDatePicker
                    value={payment.payment_date}
                    onChange={(date) => updatePaymentLine(payment.id, 'payment_date', date)}
                    className="h-9"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {payment.payment_type === 'cheque' && (
                    <Input
                      value={payment.cheque_number || ''}
                      onChange={(e) => updatePaymentLine(payment.id, 'cheque_number', e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="رقم الشيك"
                      maxLength={8}
                      className="h-9 flex-1 font-mono"
                    />
                  )}
                  {payment.payment_type === 'bank_transfer' && (
                    <Input
                      value={payment.bank_reference || ''}
                      onChange={(e) => updatePaymentLine(payment.id, 'bank_reference', e.target.value)}
                      placeholder="رقم التحويل"
                      className="h-9 flex-1"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePaymentLine(payment.id)}
                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Customer Cheque Selector */}
              {payment.payment_type === 'customer_cheque' && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <Label className="text-sm font-semibold mb-2 block">اختر شيكات العميل</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    فقط الشيكات بحالة "قيد الانتظار" متاحة للاختيار
                  </p>
                  <CustomerChequeSelector
                    selectedCheques={payment.selected_cheques || []}
                    onSelectionChange={(cheques) => {
                      updatePaymentLine(payment.id, 'selected_cheques', cheques);
                      const total = cheques.reduce((sum, c) => sum + c.amount, 0);
                      updatePaymentLine(payment.id, 'amount', total);
                    }}
                  />
                </div>
              )}

              {/* Cheque Image Upload */}
              {payment.payment_type === 'cheque' && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <Label className="text-xs text-muted-foreground mb-2 block">صورة الشيك</Label>
                  <FileUploader
                    entityType="expense_cheque"
                    entityId={payment.id}
                    accept="image/*"
                    maxFiles={1}
                    onUploadComplete={(files) => {
                      if (files.length > 0) {
                        updatePaymentLine(payment.id, 'cheque_image_url', files[0].cdn_url);
                      }
                    }}
                  />
                  {payment.cheque_image_url && (
                    <div className="mt-2">
                      <img
                        src={payment.cheque_image_url}
                        alt="صورة الشيك"
                        className="h-16 w-auto rounded border"
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Receipt Images */}
      {paymentLines.length > 0 && (
        <Card className="p-4 border-dashed border-2">
          <Label className="font-semibold">سند قبض / إيصال</Label>
          <p className="text-xs text-muted-foreground mb-2">صورة الإيصال لجميع الدفعات</p>
          <FileUploader
            entityType="expense_receipt"
            entityId={entityId || 'new'}
            accept="image/*"
            maxFiles={5}
            onUploadComplete={(files) => {
              if (files.length > 0) {
                setMainReceiptImages(files.map((f) => f.cdn_url));
              }
            }}
          />
          {mainReceiptImages.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {mainReceiptImages.map((url, idx) => (
                <img key={idx} src={url} alt={`سند قبض ${idx + 1}`} className="h-16 w-auto rounded border" />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Notes */}
      {paymentLines.length > 0 && (
        <div className="space-y-2">
          <Label>ملاحظات</Label>
          <Textarea
            value={mainNotes}
            onChange={(e) => setMainNotes(e.target.value)}
            placeholder="ملاحظات إضافية..."
            rows={2}
          />
        </div>
      )}

      {/* Total */}
      {paymentLines.length > 0 && (
        <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
          <span className="font-medium">إجمالي الدفعات:</span>
          <span className="text-xl font-bold">₪{totalPaymentLines.toLocaleString()}</span>
        </div>
      )}

      <ChequeScannerDialog
        open={chequeScannerOpen}
        onOpenChange={setChequeScannerOpen}
        onConfirm={handleScannedCheques}
      />
    </div>
  );
}
