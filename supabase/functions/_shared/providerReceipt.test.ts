import { describe, expect, test } from 'bun:test';
import { selectProviderReceipt } from './providerReceipt';

const visa = { payment_type: 'visa', amount: 3000, refused: false, tranzila_response_code: '000', tranzila_receipt_url: 'https://my.tranzila.com/api/get_financial_document/original' };
describe('original Visa receipt routing', () => {
  test('opens the original receipt instead of issuing another', () => {
    expect(selectProviderReceipt([visa])).toEqual({ kind: 'provider', url: visa.tranzila_receipt_url });
  });
  test('does not route refused Visa payments to receipts', () => {
    expect(selectProviderReceipt([{ ...visa, refused: true }])).toEqual({ kind: 'local' });
  });
  test('does not replace a missing original with a confirmation', () => {
    expect(selectProviderReceipt([{ ...visa, tranzila_receipt_url: null }]).kind).toBe('error');
  });
  test('does not omit cash from a mixed receipt request', () => {
    expect(selectProviderReceipt([visa, { payment_type: 'cash', amount: 100 }]).kind).toBe('error');
  });
  test('does not silently omit a second original receipt', () => {
    expect(selectProviderReceipt([visa, { ...visa, tranzila_receipt_url: 'https://my.tranzila.com/api/get_financial_document/second' }]).kind).toBe('error');
  });
  test('preserves cash receipt routing', () => {
    expect(selectProviderReceipt([{ payment_type: 'cash', amount: 100 }])).toEqual({ kind: 'local' });
  });
});