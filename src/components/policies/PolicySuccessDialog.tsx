import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { autoPrintPaymentReceipt } from "@/lib/autoPrintReceipt";
import { Printer, MessageSquare, MessageCircle, X, Loader2, Check, AlertCircle, Receipt, FileText } from "lucide-react";


interface PolicySuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  clientId: string;
  clientPhone: string | null;
  isPackage: boolean;
  onClose: () => void;
}

export function PolicySuccessDialog({
  open,
  onOpenChange,
  policyId,
  clientId,
  clientPhone,
  isPackage,
  onClose,
}: PolicySuccessDialogProps) {
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // WhatsApp states
  const [sendingInvoiceWa, setSendingInvoiceWa] = useState(false);
  const [invoiceWaSent, setInvoiceWaSent] = useState(false);
  const [sendingReceiptWa, setSendingReceiptWa] = useState(false);
  const [receiptWaSent, setReceiptWaSent] = useState(false);

  // Receipt states
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [sendingReceiptSms, setSendingReceiptSms] = useState(false);
  const [receiptSmsSent, setReceiptSmsSent] = useState(false);

  // Tranzila invoice states
  const [generatingTranzilaInvoice, setGeneratingTranzilaInvoice] = useState(false);
  const [tranzilaInvoiceUrl, setTranzilaInvoiceUrl] = useState<string | null>(null);
  const [hasVisaPayment, setHasVisaPayment] = useState(false);

  // Fetch payment IDs when dialog opens
  useEffect(() => {
    if (!open || !policyId) return;

    const fetchPayments = async () => {
      try {
        let policyIds = [policyId];

        if (isPackage) {
          const { data: mainPolicy } = await supabase
            .from('policies')
            .select('group_id')
            .eq('id', policyId)
            .single();

          if (mainPolicy?.group_id) {
            const { data: groupPolicies } = await supabase
              .from('policies')
              .select('id')
              .eq('group_id', mainPolicy.group_id);
            if (groupPolicies) {
              policyIds = groupPolicies.map(p => p.id);
            }
          }
        }

        const { data: payments } = await supabase
          .from('policy_payments')
          .select('id, payment_type, tranzila_receipt_url')
          .in('policy_id', policyIds);

        if (payments && payments.length > 0) {
          setPaymentIds(payments.map(p => p.id));
          const visaPayment = payments.find(p => p.payment_type === 'visa');
          if (visaPayment) {
            setHasVisaPayment(true);
            if (visaPayment.tranzila_receipt_url) {
              setTranzilaInvoiceUrl(visaPayment.tranzila_receipt_url);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching payment IDs:', err);
      }
    };

    fetchPayments();
  }, [open, policyId, isPackage]);

  // Auto-open the receipt with the browser print dialog as soon as the success
  // dialog appears and the payments are known (user can still print manually).
  const autoPrintedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoPrintedRef.current = false;
      return;
    }
    if (autoPrintedRef.current || paymentIds.length === 0) return;
    autoPrintedRef.current = true;
    autoPrintPaymentReceipt(paymentIds).catch(console.error);
  }, [open, paymentIds]);



  const extractErrorMessage = async (result: { data: any; error: any }): Promise<string> => {
    if (result.error) {
      if (typeof result.error === 'string') return result.error;
      if (result.error.message) return result.error.message;
      return 'حدث خطأ غير متوقع';
    }
    if (result.data?.error) return result.data.error;
    return 'حدث خطأ غير متوقع';
  };

  const handlePrintInvoice = async () => {
    setPrintingInvoice(true);
    setErrorMessage(null);
    
    try {
      let result;
      
      if (isPackage) {
        const { data: mainPolicy, error: mainPolicyError } = await supabase
          .from('policies')
          .select('group_id')
          .eq('id', policyId)
          .single();
        
        if (mainPolicyError) throw mainPolicyError;
        const groupId = mainPolicy?.group_id;
        
        if (!groupId) {
          result = await supabase.functions.invoke('send-invoice-sms', {
            body: { policy_id: policyId, skip_sms: true }
          });
        } else {
          const { data: groupPolicies, error: fetchError } = await supabase
            .from('policies')
            .select('id')
            .eq('group_id', groupId);
          if (fetchError) throw fetchError;
          const policyIds = groupPolicies?.map(p => p.id) || [policyId];
          result = await supabase.functions.invoke('send-package-invoice-sms', {
            body: { policy_ids: policyIds, skip_sms: true }
          });
        }
      } else {
        result = await supabase.functions.invoke('send-invoice-sms', {
          body: { policy_id: policyId, skip_sms: true }
        });
      }

      if (result.error || result.data?.error) {
        const errorMsg = await extractErrorMessage(result);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      const invoiceUrl = result.data?.package_invoice_url || result.data?.ab_invoice_url || result.data?.invoice_url;
      if (invoiceUrl) {
        window.open(invoiceUrl, '_blank');
        toast.success("تم فتح الفاتورة");
      } else {
        setErrorMessage("لم يتم العثور على رابط الفاتورة");
        toast.error("لم يتم العثور على رابط الفاتورة");
      }
    } catch (error) {
      console.error('Print invoice error:', error);
      const errorMsg = error instanceof Error ? error.message : "فشل في تحميل الفاتورة";
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setPrintingInvoice(false);
    }
  };

  const handleSendSms = async () => {
    if (!clientPhone) {
      toast.error("لا يوجد رقم هاتف للعميل");
      return;
    }

    setSendingSms(true);
    setErrorMessage(null);
    
    try {
      let result;
      
      if (isPackage) {
        const { data: mainPolicy, error: mainPolicyError } = await supabase
          .from('policies')
          .select('group_id')
          .eq('id', policyId)
          .single();
        if (mainPolicyError) throw mainPolicyError;
        const groupId = mainPolicy?.group_id;
        
        if (!groupId) {
          result = await supabase.functions.invoke('send-invoice-sms', {
            body: { policy_id: policyId, force_resend: true }
          });
        } else {
          const { data: groupPolicies, error: fetchError } = await supabase
            .from('policies')
            .select('id')
            .eq('group_id', groupId);
          if (fetchError) throw fetchError;
          const policyIds = groupPolicies?.map(p => p.id) || [policyId];
          result = await supabase.functions.invoke('send-package-invoice-sms', {
            body: { policy_ids: policyIds }
          });
        }
      } else {
        result = await supabase.functions.invoke('send-invoice-sms', {
          body: { policy_id: policyId, force_resend: true }
        });
      }

      if (result.error || result.data?.error) {
        const errorMsg = await extractErrorMessage(result);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      setSmsSent(true);
      toast.success("تم إرسال SMS بنجاح");
    } catch (error) {
      console.error('Send SMS error:', error);
      const errorMsg = error instanceof Error ? error.message : "فشل في إرسال SMS";
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSendingSms(false);
    }
  };

  // Use WhatsApp's official api.whatsapp.com link (not web.whatsapp.com) so the
  // OS opens the installed WhatsApp app — desktop or phone — when one is present,
  // and falls back to WhatsApp Web otherwise. The number is normalised to
  // international format (Israel +972) since WhatsApp requires a full
  // country-coded number.
  const buildWhatsAppUrl = (phone: string, message: string) => {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '972' + digits.slice(1);
    } else if (!digits.startsWith('972')) {
      digits = '972' + digits;
    }
    return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
  };

  const handleSendInvoiceWhatsApp = async () => {
    if (!clientPhone) {
      toast.error("لا يوجد رقم هاتف للعميل");
      return;
    }

    setSendingInvoiceWa(true);
    setErrorMessage(null);
    // Pre-open a tab inside the user gesture so the popup blocker allows it
    const waWindow = window.open('', '_blank');

    try {
      let result;

      if (isPackage) {
        const { data: mainPolicy, error: mainPolicyError } = await supabase
          .from('policies')
          .select('group_id')
          .eq('id', policyId)
          .single();
        if (mainPolicyError) throw mainPolicyError;
        const groupId = mainPolicy?.group_id;

        if (!groupId) {
          result = await supabase.functions.invoke('send-invoice-sms', {
            body: { policy_id: policyId, skip_sms: true }
          });
        } else {
          const { data: groupPolicies, error: fetchError } = await supabase
            .from('policies')
            .select('id')
            .eq('group_id', groupId);
          if (fetchError) throw fetchError;
          const policyIds = groupPolicies?.map(p => p.id) || [policyId];
          result = await supabase.functions.invoke('send-package-invoice-sms', {
            body: { policy_ids: policyIds, skip_sms: true }
          });
        }
      } else {
        result = await supabase.functions.invoke('send-invoice-sms', {
          body: { policy_id: policyId, skip_sms: true }
        });
      }

      if (result.error || result.data?.error) {
        const errorMsg = await extractErrorMessage(result);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        waWindow?.close();
        return;
      }

      const invoiceUrl = result.data?.package_invoice_url || result.data?.ab_invoice_url || result.data?.invoice_url;
      if (invoiceUrl) {
        const waUrl = buildWhatsAppUrl(clientPhone, `مرحباً، إليك بوليصة التأمين الخاصة بك:\n${invoiceUrl}`);
        if (waWindow) {
          waWindow.location.href = waUrl;
        } else {
          window.open(waUrl, '_blank');
        }
        setInvoiceWaSent(true);
        toast.success("تم فتح واتساب");
      } else {
        setErrorMessage("لم يتم العثور على رابط الفاتورة");
        toast.error("لم يتم العثور على رابط الفاتورة");
        waWindow?.close();
      }
    } catch (error) {
      console.error('Send invoice WhatsApp error:', error);
      const errorMsg = error instanceof Error ? error.message : "فشل في إرسال الفاتورة عبر واتساب";
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
      waWindow?.close();
    } finally {
      setSendingInvoiceWa(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (paymentIds.length === 0) return;
    setPrintingReceipt(true);
    setErrorMessage(null);

    try {
      const result = await supabase.functions.invoke('generate-payment-receipt', {
        body: { payment_id: paymentIds[0] }
      });

      if (result.error || result.data?.error) {
        const errorMsg = await extractErrorMessage(result);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      const receiptUrl = result.data?.receipt_url;
      if (receiptUrl) {
        window.open(receiptUrl, '_blank');
        toast.success("تم فتح إيصال الدفع");
      } else {
        setErrorMessage("لم يتم العثور على رابط الإيصال");
        toast.error("لم يتم العثور على رابط الإيصال");
      }
    } catch (error) {
      console.error('Print receipt error:', error);
      const errorMsg = error instanceof Error ? error.message : "فشل في تحميل الإيصال";
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setPrintingReceipt(false);
    }
  };

  const handleSendReceiptSms = async () => {
    if (!clientPhone || paymentIds.length === 0) {
      toast.error("لا يوجد رقم هاتف أو دفعات");
      return;
    }

    setSendingReceiptSms(true);
    setErrorMessage(null);

    try {
      // First generate the receipt to get URL
      const receiptResult = await supabase.functions.invoke('generate-payment-receipt', {
        body: { payment_id: paymentIds[0] }
      });

      if (receiptResult.error || receiptResult.data?.error) {
        const errorMsg = await extractErrorMessage(receiptResult);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      const receiptUrl = receiptResult.data?.receipt_url;
      if (!receiptUrl) {
        setErrorMessage("لم يتم العثور على رابط الإيصال");
        toast.error("لم يتم العثور على رابط الإيصال");
        return;
      }

      // Send via SMS
      const smsResult = await supabase.functions.invoke('send-sms', {
        body: {
          phone: clientPhone,
          message: `إيصال الدفع الخاص بك:\n${receiptUrl}`
        }
      });

      if (smsResult.error || smsResult.data?.error) {
        const errorMsg = await extractErrorMessage(smsResult);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      setReceiptSmsSent(true);
      toast.success("تم إرسال إيصال الدفع عبر SMS");
    } catch (error) {
      console.error('Send receipt SMS error:', error);
      const errorMsg = error instanceof Error ? error.message : "فشل في إرسال الإيصال";
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSendingReceiptSms(false);
    }
  };

  const handleSendReceiptWhatsApp = async () => {
    if (!clientPhone || paymentIds.length === 0) {
      toast.error("لا يوجد رقم هاتف أو دفعات");
      return;
    }

    setSendingReceiptWa(true);
    setErrorMessage(null);
    // Pre-open a tab inside the user gesture so the popup blocker allows it
    const waWindow = window.open('', '_blank');

    try {
      // First generate the receipt to get URL
      const receiptResult = await supabase.functions.invoke('generate-payment-receipt', {
        body: { payment_id: paymentIds[0] }
      });

      if (receiptResult.error || receiptResult.data?.error) {
        const errorMsg = await extractErrorMessage(receiptResult);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        waWindow?.close();
        return;
      }

      const receiptUrl = receiptResult.data?.receipt_url;
      if (!receiptUrl) {
        setErrorMessage("لم يتم العثور على رابط الإيصال");
        toast.error("لم يتم العثور على رابط الإيصال");
        waWindow?.close();
        return;
      }

      const waUrl = buildWhatsAppUrl(clientPhone, `مرحباً، إليك إيصال الدفع الخاص بك:\n${receiptUrl}`);
      if (waWindow) {
        waWindow.location.href = waUrl;
      } else {
        window.open(waUrl, '_blank');
      }
      setReceiptWaSent(true);
      toast.success("تم فتح واتساب");
    } catch (error) {
      console.error('Send receipt WhatsApp error:', error);
      const errorMsg = error instanceof Error ? error.message : "فشل في إرسال الإيصال عبر واتساب";
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
      waWindow?.close();
    } finally {
      setSendingReceiptWa(false);
    }
  };

  const handleTranzilaInvoice = async () => {
    // If we already have the URL, just open it
    if (tranzilaInvoiceUrl) {
      window.open(tranzilaInvoiceUrl, '_blank');
      return;
    }

    setGeneratingTranzilaInvoice(true);
    setErrorMessage(null);

    try {
      // Find a payment for this policy (prefer visa, but try any)
      let policyIds = [policyId];
      if (isPackage) {
        const { data: mainPolicy } = await supabase.from('policies').select('group_id').eq('id', policyId).single();
        if (mainPolicy?.group_id) {
          const { data: groupPolicies } = await supabase.from('policies').select('id').eq('group_id', mainPolicy.group_id);
          if (groupPolicies) policyIds = groupPolicies.map(p => p.id);
        }
      }

      const { data: payments } = await supabase
        .from('policy_payments')
        .select('id, payment_type, tranzila_receipt_url')
        .in('policy_id', policyIds)
        .order('created_at', { ascending: false });

      // Prefer visa payment, fallback to first payment
      const visaPayment = payments?.find(p => p.payment_type === 'visa');
      const targetPayment = visaPayment || payments?.[0];

      if (!targetPayment) {
        setErrorMessage("لا يوجد دفعات");
        return;
      }

      if (targetPayment.tranzila_receipt_url) {
        setTranzilaInvoiceUrl(targetPayment.tranzila_receipt_url);
        window.open(targetPayment.tranzila_receipt_url, '_blank');
        return;
      }

      // Generate invoice via edge function
      const result = await supabase.functions.invoke('tranzila-create-invoice', {
        body: { payment_id: targetPayment.id }
      });

      // Prefer logical error from response body over generic SDK error
      if (result.data && result.data.success === false) {
        const errorMsg = result.data.error || 'فشل في إنشاء القبض';
        const detail = result.data.provider_raw ? ` (${result.data.provider_raw})` : '';
        setErrorMessage(errorMsg + detail);
        toast.error(errorMsg);
        return;
      }
      if (result.error) {
        const errorMsg = result.error?.message || 'فشل في إنشاء القبض';
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      const url = result.data?.receipt_url;
      if (url) {
        setTranzilaInvoiceUrl(url);
        window.open(url, '_blank');
        toast.success("تم إنشاء קבלה מ-Tranzila");
      }
    } catch (error) {
      console.error('Tranzila invoice error:', error);
      const errorMsg = error instanceof Error ? error.message : "فشل في إنشاء القבלה";
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setGeneratingTranzilaInvoice(false);
    }
  };

  const handleClose = () => {
    setErrorMessage(null);
    onOpenChange(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success">
            <Check className="h-6 w-6" />
            تم إنشاء الوثيقة بنجاح
          </DialogTitle>
          <DialogDescription>
            يمكنك طباعة بوليصة التأمين أو فاتورة الدفع أو إرسالها للعميل عبر SMS أو واتساب
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-4">
          {/* Invoice Section */}
          <p className="text-xs font-semibold text-muted-foreground">بوليصة التأمين</p>
          <Button
            variant="outline"
            className="w-full gap-2 h-12"
            onClick={handlePrintInvoice}
            disabled={printingInvoice}
          >
            {printingInvoice ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Printer className="h-5 w-5" />
            )}
            طباعة بوليصة التأمين
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2 h-12"
            onClick={handleSendSms}
            disabled={sendingSms || smsSent || !clientPhone}
          >
            {sendingSms ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : smsSent ? (
              <Check className="h-5 w-5 text-success" />
            ) : (
              <MessageSquare className="h-5 w-5" />
            )}
            {smsSent ? "تم إرسال بوليصة التأمين SMS" : "إرسال بوليصة التأمين SMS"}
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2 h-12 border-green-600/30 text-green-700 hover:bg-green-50 hover:text-green-800"
            onClick={handleSendInvoiceWhatsApp}
            disabled={sendingInvoiceWa || !clientPhone}
          >
            {sendingInvoiceWa ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : invoiceWaSent ? (
              <Check className="h-5 w-5 text-success" />
            ) : (
              <MessageCircle className="h-5 w-5" />
            )}
            إرسال بوليصة التأمين واتساب
          </Button>

          {/* Receipt Section - only show if payments exist */}
          {paymentIds.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="text-xs font-semibold text-muted-foreground">فاتورة الدفع</p>

              <Button
                variant="outline"
                className="w-full gap-2 h-12"
                onClick={handlePrintReceipt}
                disabled={printingReceipt}
              >
                {printingReceipt ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Receipt className="h-5 w-5" />
                )}
                طباعة فاتورة الدفع
              </Button>

              <Button
                variant="outline"
                className="w-full gap-2 h-12"
                onClick={handleSendReceiptSms}
                disabled={sendingReceiptSms || receiptSmsSent || !clientPhone}
              >
                {sendingReceiptSms ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : receiptSmsSent ? (
                  <Check className="h-5 w-5 text-success" />
                ) : (
                  <MessageSquare className="h-5 w-5" />
                )}
                {receiptSmsSent ? "تم إرسال فاتورة الدفع SMS" : "إرسال فاتورة الدفع SMS"}
              </Button>

              <Button
                variant="outline"
                className="w-full gap-2 h-12 border-green-600/30 text-green-700 hover:bg-green-50 hover:text-green-800"
                onClick={handleSendReceiptWhatsApp}
                disabled={sendingReceiptWa || !clientPhone}
              >
                {sendingReceiptWa ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : receiptWaSent ? (
                  <Check className="h-5 w-5 text-success" />
                ) : (
                  <MessageCircle className="h-5 w-5" />
                )}
                إرسال فاتورة الدفع واتساب
              </Button>

              {/* Tranzila Invoice Button - only for visa payments */}
              {hasVisaPayment && (
                <Button
                  variant="outline"
                  className="w-full gap-2 h-12 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={handleTranzilaInvoice}
                  disabled={generatingTranzilaInvoice}
                >
                  {generatingTranzilaInvoice ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : tranzilaInvoiceUrl ? (
                    <Check className="h-5 w-5 text-success" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                  {tranzilaInvoiceUrl ? "فتح קבלה מ-Tranzila" : "הפקת קבלה מ-Tranzila"}
                </Button>
              )}
            </>
          )}

          {!clientPhone && (
            <p className="text-xs text-muted-foreground text-center">
              لا يوجد رقم هاتف للعميل لإرسال SMS أو واتساب
            </p>
          )}

          <Separator className="my-1" />

          <Button
            variant="ghost"
            className="w-full gap-2"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
