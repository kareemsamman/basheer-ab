import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getFullCdnUrl } from "@/lib/utils";
import { FileSignature, Send, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

interface ClientSignatureSectionProps {
  clientId: string;
  clientName: string;
  phoneNumber: string | null;
  signatureUrl: string | null;
  onSignatureSent?: () => void;
}

export function ClientSignatureSection({
  clientId,
  clientName,
  phoneNumber,
  signatureUrl,
  onSignatureSent,
}: ClientSignatureSectionProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Ensure signature URL has full CDN prefix
  const fullSignatureUrl = getFullCdnUrl(signatureUrl);
  const hasSigned = !!signatureUrl;

  // Helper to translate common edge function errors to Arabic
  const getArabicErrorMessage = (englishError: string): string => {
    const errorMap: Record<string, string> = {
      "Policy number is required before sending invoices": "يجب إدخال رقم البوليصة قبل الإرسال",
      "At least one policy file must be uploaded before sending invoices": "يجب رفع ملف بوليصة واحد على الأقل قبل الإرسال",
      "Client phone number is required": "رقم هاتف العميل مطلوب",
      "SMS service is not enabled": "خدمة الرسائل غير مفعلة",
      "Policy not found": "الوثيقة غير موجودة",
      "Client not found": "العميل غير موجود",
      "Client already has a signature": "العميل لديه توقيع مسبق",
      "Failed to fetch SMS settings": "فشل في جلب إعدادات الرسائل",
      "Failed to create signature request": "فشل في إنشاء طلب التوقيع",
      "Missing authorization header": "خطأ في المصادقة",
      "Invalid authentication": "جلسة غير صالحة",
    };
    return errorMap[englishError] || englishError;
  };

  const handleSendSignatureRequest = async () => {
    if (!phoneNumber) {
      toast({
        title: "خطأ",
        description: "لا يوجد رقم هاتف للعميل",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-signature-sms', {
        body: { client_id: clientId },
      });

      // Parse edge function error response
      if (error) {
        let errorMessage = "فشل في إرسال طلب التوقيع";
        try {
          const errorBody = typeof error.message === 'string' && error.message.includes('{') 
            ? JSON.parse(error.message) 
            : null;
          if (errorBody?.error) {
            errorMessage = getArabicErrorMessage(errorBody.error);
          }
        } catch {
          if (error.context?.body) {
            try {
              const body = typeof error.context.body === 'string' 
                ? JSON.parse(error.context.body) 
                : error.context.body;
              if (body?.error) {
                errorMessage = getArabicErrorMessage(body.error);
              }
            } catch {}
          }
        }
        throw new Error(errorMessage);
      }

      // Check if response indicates the client already signed
      if (data && data.success === false) {
        toast({
          title: "تنبيه",
          description: getArabicErrorMessage(data.message) || "العميل لديه توقيع مسبق",
        });
      } else {
        toast({
          title: "تم الإرسال",
          description: `تم إرسال رابط التوقيع إلى ${phoneNumber}`,
        });
      }
      onSignatureSent?.();
    } catch (error: any) {
      console.error("Error sending signature request:", error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال طلب التوقيع",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Card className={hasSigned ? "border-success/30 bg-success/5" : "border-amber-500/30 bg-amber-500/5"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            توقيع العميل
            {hasSigned ? (
              <Badge variant="success" className="mr-auto gap-1">
                <CheckCircle2 className="h-3 w-3" />
                تم التوقيع
              </Badge>
            ) : (
              <Badge variant="warning" className="mr-auto gap-1">
                <AlertTriangle className="h-3 w-3" />
                لم يوقّع
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasSigned ? (
            <div className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="w-full gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                عرض التوقيع
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                العميل لم يوقّع بعد. أرسل له رابط التوقيع عبر SMS.
              </p>
              <Button
                size="sm"
                onClick={handleSendSignatureRequest}
                disabled={sending || !phoneNumber}
                className="w-full gap-2"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                إرسال طلب التوقيع
              </Button>
              {!phoneNumber && (
                <p className="text-xs text-destructive text-center">
                  لا يوجد رقم هاتف
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signature Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle>توقيع العميل - {clientName}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-4 bg-background rounded-lg border">
            {fullSignatureUrl && (
              <img
                src={fullSignatureUrl}
                alt={`توقيع العميل ${clientName}`}
                loading="lazy"
                className="max-w-full max-h-[70vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
