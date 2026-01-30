import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Printer, MessageSquare, X, Loader2, Check } from "lucide-react";

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

  const handlePrintInvoice = async () => {
    setPrintingInvoice(true);
    try {
      // Use the appropriate invoice endpoint based on package type
      const functionName = isPackage ? 'send-package-invoice-sms' : 'send-invoice-sms';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: isPackage 
          ? { group_id: policyId, skip_sms: true }
          : { policyId, phoneNumber: clientPhone, skip_sms: true }
      });

      if (error) throw error;

      // Open the invoice URL in a new tab
      if (data?.invoice_url) {
        window.open(data.invoice_url, '_blank');
      } else if (data?.invoiceUrl) {
        window.open(data.invoiceUrl, '_blank');
      } else {
        toast.error("لم يتم العثور على رابط الفاتورة");
      }
    } catch (error) {
      console.error('Print invoice error:', error);
      toast.error("فشل في تحميل الفاتورة");
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
    try {
      const functionName = isPackage ? 'send-package-invoice-sms' : 'send-invoice-sms';
      
      const { error } = await supabase.functions.invoke(functionName, {
        body: isPackage 
          ? { group_id: policyId, force_resend: true }
          : { policyId, phoneNumber: clientPhone, force_resend: true }
      });

      if (error) throw error;

      setSmsSent(true);
      toast.success("تم إرسال SMS بنجاح");
    } catch (error) {
      console.error('Send SMS error:', error);
      toast.error("فشل في إرسال SMS");
    } finally {
      setSendingSms(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success">
            <Check className="h-6 w-6" />
            تم إنشاء الوثيقة بنجاح
          </DialogTitle>
          <DialogDescription>
            يمكنك طباعة الفاتورة أو إرسالها للعميل عبر SMS
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-4">
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
            طباعة الفاتورة
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
            {smsSent ? "تم إرسال SMS" : "إرسال SMS للعميل"}
          </Button>

          {!clientPhone && (
            <p className="text-xs text-muted-foreground text-center">
              لا يوجد رقم هاتف للعميل لإرسال SMS
            </p>
          )}

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
