import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

interface Click2CallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: string;
  onSuccess?: () => void;
}

export function Click2CallDialog({
  open,
  onOpenChange,
  phoneNumber,
  onSuccess,
}: Click2CallDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCall = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('click2call', {
        body: { phone_number: phoneNumber },
      });

      if (error) {
        console.error('Click2Call error:', error);
        toast({
          title: "خطأ",
          description: "تعذر بدء الاتصال",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        toast({
          title: "تم بدء الاتصال",
          description: `جاري الاتصال بـ ${phoneNumber}`,
        });
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast({
          title: "فشل الاتصال",
          description: data?.message || "تعذر بدء الاتصال",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error('Click2Call exception:', err);
      toast({
        title: "خطأ",
        description: "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            هل تريد الاتصال؟
          </DialogTitle>
          <DialogDescription>
            سيتم بدء مكالمة هاتفية إلى الرقم التالي
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-6">
          <div className="text-2xl font-bold text-foreground" dir="ltr">
            {phoneNumber}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleCall}
            disabled={isLoading}
            variant="default"
          >
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الاتصال...
              </>
            ) : (
              <>
                <Phone className="ml-2 h-4 w-4" />
                اتصال
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
