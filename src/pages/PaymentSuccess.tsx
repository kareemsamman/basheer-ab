import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get("payment_id");

  useEffect(() => {
    // Notify parent window (TranzilaPaymentModal) of success
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "TRANZILA_PAYMENT_RESULT", status: "success", payment_id: paymentId },
        "*"
      );
    }
  }, [paymentId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle className="h-12 w-12 text-success" />
        </div>
        <h1 className="text-2xl font-bold text-success">تمت عملية الدفع بنجاح!</h1>
        <p className="text-muted-foreground">شكراً لك، تم استلام الدفع</p>
      </div>
    </div>
  );
}
