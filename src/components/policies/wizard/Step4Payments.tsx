import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { Plus, Trash2, CreditCard, AlertCircle, Loader2, ImageIcon, FolderOpen, Upload, X } from "lucide-react";
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
  // For Tranzila "pay first" flow
  onCreateTempPolicy: () => Promise<string | null>; // Returns policy ID or null on error
  onDeleteTempPolicy: (policyId: string) => Promise<void>; // Delete temp policy on failure
  tempPolicyId: string | null;
  // File uploads
  insuranceFiles: File[];
  setInsuranceFiles: (files: File[]) => void;
  crmFiles: File[];
  setCrmFiles: (files: File[]) => void;
}

export function Step4Payments({
  payments,
  setPayments,
  pricing,
  totalPaidPayments,
  remainingToPay,
  paymentsExceedPrice,
  errors,
  onCreateTempPolicy,
  onDeleteTempPolicy,
  tempPolicyId,
  insuranceFiles,
  setInsuranceFiles,
  crmFiles,
  setCrmFiles,
}: Step4Props) {
  const [showTranzilaModal, setShowTranzilaModal] = useState(false);
  const [selectedVisaPaymentIndex, setSelectedVisaPaymentIndex] = useState<number | null>(null);
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [activePolicyIdForPayment, setActivePolicyIdForPayment] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("payments");
  
  const insuranceInputRef = useRef<HTMLInputElement>(null);
  const crmInputRef = useRef<HTMLInputElement>(null);

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

  // Handle Visa Pay click - creates temp policy first then opens Tranzila
  const handleVisaPayClick = async (index: number) => {
    const payment = payments[index];
    if (!payment || (payment.amount || 0) <= 0) return;

    setCreatingPolicy(true);
    setSelectedVisaPaymentIndex(index);

    try {
      // Create temp policy to get UUID
      const policyId = tempPolicyId || await onCreateTempPolicy();
      
      if (!policyId) {
        throw new Error('Failed to create policy');
      }

      setActivePolicyIdForPayment(policyId);
      setShowTranzilaModal(true);
    } catch (error) {
      console.error('Error creating temp policy:', error);
      setSelectedVisaPaymentIndex(null);
    } finally {
      setCreatingPolicy(false);
    }
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
    setActivePolicyIdForPayment(null);
  };

  const handleVisaFailure = async () => {
    // On failure, delete the temp policy if it was created for this payment
    if (activePolicyIdForPayment && !tempPolicyId) {
      await onDeleteTempPolicy(activePolicyIdForPayment);
    }
    setShowTranzilaModal(false);
    setSelectedVisaPaymentIndex(null);
    setActivePolicyIdForPayment(null);
  };

  const selectedVisaPayment = selectedVisaPaymentIndex !== null ? payments[selectedVisaPaymentIndex] : null;
  const hasUnpaidVisa = payments.some(p => p.payment_type === 'visa' && !p.tranzila_paid && (p.amount || 0) > 0);

  // File handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'insurance' | 'crm') => {
    const files = e.target.files;
    if (!files) return;
    
    const fileArray = Array.from(files);
    if (type === 'insurance') {
      setInsuranceFiles([...insuranceFiles, ...fileArray]);
    } else {
      setCrmFiles([...crmFiles, ...fileArray]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number, type: 'insurance' | 'crm') => {
    if (type === 'insurance') {
      setInsuranceFiles(insuranceFiles.filter((_, i) => i !== index));
    } else {
      setCrmFiles(crmFiles.filter((_, i) => i !== index));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderFileList = (files: File[], type: 'insurance' | 'crm') => (
    <div className="space-y-2">
      {files.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          لا توجد ملفات
        </div>
      ) : (
        files.map((file, index) => (
          <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {file.type.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="text-sm truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
              onClick={() => removeFile(index, type)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="payments" className="gap-1.5">
            <CreditCard className="h-4 w-4" />
            الدفعات
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-1.5">
            <ImageIcon className="h-4 w-4" />
            الملفات ({insuranceFiles.length + crmFiles.length})
          </TabsTrigger>
        </TabsList>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-4 space-y-6">
          {/* Payment Summary Bar */}
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
              <div className="space-y-3">
                {payments.map((payment, index) => {
                  const isVisa = payment.payment_type === 'visa';
                  const visaPaid = payment.tranzila_paid;
                  const visaAmount = payment.amount || 0;
                  const isProcessing = creatingPolicy && selectedVisaPaymentIndex === index;
                  
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
                          {isVisa && !visaPaid && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleVisaPayClick(index)}
                              disabled={visaAmount <= 0 || isProcessing}
                              className="gap-1.5 bg-primary hover:bg-primary/90"
                            >
                              {isProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CreditCard className="h-4 w-4" />
                              )}
                              {isProcessing ? 'جاري التحضير...' : 'ادفع'}
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
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="mt-4 space-y-4">
          {/* Insurance Files */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <Label className="font-semibold">ملفات التأمين</Label>
              </div>
              <div className="relative">
                <input
                  ref={insuranceInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,video/*"
                  onChange={(e) => handleFileSelect(e, 'insurance')}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
                <Button type="button" size="sm" variant="outline" className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  رفع ملف
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              فواتير وإيصالات ترسل للعميل
            </p>
            {renderFileList(insuranceFiles, 'insurance')}
          </Card>

          {/* CRM Files */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <Label className="font-semibold">ملفات النظام</Label>
              </div>
              <div className="relative">
                <input
                  ref={crmInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,video/*"
                  onChange={(e) => handleFileSelect(e, 'crm')}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
                <Button type="button" size="sm" variant="outline" className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  رفع ملف
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              هوية، رخصة، صور سيارة - ملفات داخلية للنظام
            </p>
            {renderFileList(crmFiles, 'crm')}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tranzila Payment Modal */}
      {selectedVisaPayment && activePolicyIdForPayment && (
        <TranzilaPaymentModal
          open={showTranzilaModal}
          onOpenChange={(open) => {
            if (!open) handleVisaFailure();
            setShowTranzilaModal(open);
          }}
          policyId={activePolicyIdForPayment}
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