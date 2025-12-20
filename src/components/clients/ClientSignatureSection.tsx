import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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

  const hasSigned = !!signatureUrl;

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
      const { data: session } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-signature-sms`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ client_id: clientId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "فشل في إرسال طلب التوقيع");
      }

      toast({
        title: "تم الإرسال",
        description: `تم إرسال رابط التوقيع إلى ${phoneNumber}`,
      });
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
            {signatureUrl && (
              <img
                src={signatureUrl}
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
