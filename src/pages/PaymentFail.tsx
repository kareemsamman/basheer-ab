import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";

export default function PaymentFail() {
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get("payment_id");

  useEffect(() => {
    // Notify parent window (TranzilaPaymentModal) of failure
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "TRANZILA_PAYMENT_RESULT", status: "failed", payment_id: paymentId },
        "*"
      );
    }
  }, [paymentId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-destructive">فشلت عملية الدفع</h1>
        <p className="text-muted-foreground">حدث خطأ أثناء معالجة الدفع</p>
      </div>
    </div>
  );
}
