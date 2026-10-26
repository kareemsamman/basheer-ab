export interface ReceiptCandidate {
  id: string;
  amount: number | string;
  refused: boolean | null;
  locked: boolean | null;
  source: string | null;
  policy: { policy_type_parent: string } | null;
}

export function selectReceiptPayments<T extends ReceiptCandidate>(payments: T[]): T[] {
  return payments.filter(payment => !payment.refused && !payment.locked &&
    payment.source !== 'system' && Number(payment.amount) > 0 &&
    payment.policy?.policy_type_parent !== 'ELZAMI');
}

export async function receiptErrorMessage(result: {
  data?: { error?: string } | null;
  error?: { message?: string; context?: Response } | string | null;
}): Promise<string> {
  if (result.data?.error) return result.data.error;
  if (typeof result.error === 'string') return result.error;
  const response = result.error?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (typeof body.error === 'string') return body.error;
      if (typeof body.message === 'string') return body.message;
    } catch { /* Keep a readable fallback for non-JSON responses. */ }
  }
  const message = result.error?.message;
  return message && !message.includes('non-2xx') ? message : 'تعذّر فتح فاتورة الدفع؛ حاول مرة أخرى';
}