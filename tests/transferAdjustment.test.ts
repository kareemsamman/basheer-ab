import { expect, test } from 'bun:test';
import { transferCashAmount } from '../src/lib/transferAdjustment';

test('uncollected ₪150 transfer difference must not create a cash payment', () => {
  expect(transferCashAmount(150, false)).toBe(0);
});

test('explicitly collected ₪150 transfer difference records exactly ₪150', () => {
  expect(transferCashAmount(150, true)).toBe(150);
});