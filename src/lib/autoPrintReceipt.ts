import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Opens a blank window synchronously (avoids popup blockers) that will later
 * be redirected to the generated receipt URL with auto-print enabled.
 */
export function openReceiptPrintWindow(): Window | null {
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(
      `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>קבלה</title></head>` +
        `<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#334155">` +
        `جاري تحضير الإيصال للطباعة...</body></html>`
    );
    w.document.close();
  }
  return w;
}

/**
 * Generates the receipt for the newly created payment(s) and opens it with the
 * browser print dialog triggered automatically.
 */
export async function autoPrintPaymentReceipt(
  paymentIds: string[],
  totalAmount?: number,
  printWindow?: Window | null
): Promise<void> {
  if (!paymentIds.length) return;
  const w = printWindow !== undefined ? printWindow : openReceiptPrintWindow();

  try {
    const isBulk = paymentIds.length > 1;
    const { data, error } = await supabase.functions.invoke(
      isBulk ? "generate-bulk-payment-receipt" : "generate-payment-receipt",
      {
        body: isBulk
          ? { payment_ids: paymentIds, total_amount: totalAmount }
          : { payment_id: paymentIds[0] },
      }
    );

    if (error) throw error;

    const url: string | undefined = data?.receipt_url || data?.url;
    if (!url) throw new Error("missing receipt url");

    const printUrl = `${url}${url.includes("?") ? "&" : "?"}print=1`;
    if (w) {
      w.location.href = printUrl;
    } else {
      window.open(printUrl, "_blank");
    }
  } catch (err) {
    console.error("Auto print receipt failed:", err);
    if (w) w.close();
    toast.error("فشل في فتح الإيصال للطباعة");
  }
}
