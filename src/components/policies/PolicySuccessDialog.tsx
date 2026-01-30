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
import { Printer, MessageSquare, X, Loader2, Check, AlertCircle } from "lucide-react";

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

  const extractErrorMessage = async (result: { data: any; error: any }): Promise<string> => {
    // Handle function invoke error
    if (result.error) {
      // Try to extract error message from the error object
      if (typeof result.error === 'string') return result.error;
      if (result.error.message) return result.error.message;
      return 'حدث خطأ غير متوقع';
    }
    
    // Handle error in response data
    if (result.data?.error) {
      return result.data.error;
    }
    
    return 'حدث خطأ غير متوقع';
  };

  const handlePrintInvoice = async () => {
    setPrintingInvoice(true);
    setErrorMessage(null);
    
    try {
      let result;
      
      if (isPackage) {
        // For package: first get all policy IDs in the group
        const { data: groupPolicies, error: fetchError } = await supabase
          .from('policies')
          .select('id')
          .eq('group_id', policyId);
        
        if (fetchError) throw fetchError;
        
        const policyIds = groupPolicies?.map(p => p.id) || [policyId];
        
        result = await supabase.functions.invoke('send-package-invoice-sms', {
          body: { policy_ids: policyIds, skip_sms: true }
        });
      } else {
        // Single policy
        result = await supabase.functions.invoke('send-invoice-sms', {
          body: { policy_id: policyId, skip_sms: true }
        });
      }

      // Check for errors
      if (result.error || result.data?.error) {
        const errorMsg = await extractErrorMessage(result);
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      // Open the invoice URL in a new tab
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
        // For package: first get all policy IDs in the group
        const { data: groupPolicies, error: fetchError } = await supabase
          .from('policies')
          .select('id')
          .eq('group_id', policyId);
        
        if (fetchError) throw fetchError;
        
        const policyIds = groupPolicies?.map(p => p.id) || [policyId];
        
        result = await supabase.functions.invoke('send-package-invoice-sms', {
          body: { policy_ids: policyIds }
        });
      } else {
        result = await supabase.functions.invoke('send-invoice-sms', {
          body: { policy_id: policyId, force_resend: true }
        });
      }

      // Check for errors
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

  const handleClose = () => {
    setErrorMessage(null);
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

        {errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

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
