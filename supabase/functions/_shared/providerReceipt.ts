export interface ProviderReceiptPayment {
  payment_type: string;
  amount: number | string;
  refused?: boolean | null;
  locked?: boolean | null;
  source?: string | null;
  tranzila_transaction_id?: string | null;
  tranzila_response_code?: string | null;
  tranzila_receipt_url?: string | null;
}

export function selectProviderReceipt(payments: ProviderReceiptPayment[]):
  { kind: 'local' } | { kind: 'provider'; url: string } | { kind: 'error'; message: string } {
  const eligible = payments.filter(p => !p.refused && !p.locked && p.source !== 'system' && Number(p.amount) > 0);
  const provider = eligible.filter(p => p.payment_type === 'visa' &&
    (p.tranzila_transaction_id != null || p.tranzila_response_code != null || p.tranzila_receipt_url != null));
  if (!provider.length) return { kind: 'local' };
  if (provider.some(p => !p.tranzila_receipt_url)) {
    return { kind: 'error', message: 'קבלה الأصلية غير جاهزة؛ افتح زر إيصال ترانزيلا لهذه الدفعة أولاً' };
  }
  const urls = [...new Set(provider.map(p => p.tranzila_receipt_url))];
  if (eligible.length !== provider.length || urls.length !== 1) {
    return { kind: 'error', message: 'دفعات الفيزا لها קבלות أصلية منفصلة؛ اطبع كل إيصال على حدة' };
  }
  const url = urls[0];
  if (!url) return { kind: 'error', message: 'لم يتم العثور على קבלה الأصلية' };
  return { kind: 'provider', url };
}