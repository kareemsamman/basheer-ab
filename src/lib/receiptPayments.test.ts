import { describe, expect, test } from 'bun:test';
import { receiptErrorMessage, selectReceiptPayments } from './receiptPayments';

const payment = (overrides = {}) => ({ id: 'cash', amount: 1370, refused: false,
  locked: false, source: null, policy: { policy_type_parent: 'THIRD_FULL' }, ...overrides });

describe('receipt payment selection', () => {
  test('automatic חובה ₪2288 is not a receipt payment', () => {
    expect(selectReceiptPayments([payment({ id: 'elzami', amount: 2288, locked: true,
      source: 'system', policy: { policy_type_parent: 'ELZAMI' } })])).toEqual([]);
  });
  test('חובה cannot be selected even when unlocked', () => {
    expect(selectReceiptPayments([payment({ policy: { policy_type_parent: 'ELZAMI' } })])).toEqual([]);
  });
  test('select real cash after automatic entry, preserving its amount', () => {
    const cash = payment();
    expect(selectReceiptPayments([payment({ locked: true, source: 'system' }), cash])).toEqual([cash]);
  });
  test('refused payments are excluded', () => {
    expect(selectReceiptPayments([payment({ refused: true })])).toEqual([]);
  });
  test('zero payments are excluded', () => {
    expect(selectReceiptPayments([payment({ amount: 0 })])).toEqual([]);
  });
  test('read actual function error before generic HTTP message', async () => {
    expect(await receiptErrorMessage({ error: { message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'specific failure' }), { status: 400 }) } })).toBe('specific failure');
  });
});