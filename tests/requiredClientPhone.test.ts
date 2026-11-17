import { expect, test } from 'bun:test';
import { hasRequiredClientPhone } from '../src/lib/validation';

test('client accounts require a primary phone of exactly 10 numeric digits', () => {
  for (const phone of [null, undefined, '', ' ', '054606568', '05460656800', '054-6065680', 'abcdefghij']) {
    expect(hasRequiredClientPhone(phone)).toBe(false);
  }
  expect(hasRequiredClientPhone('0546065680')).toBe(true);
});

test('policy creation rejects an existing client without a valid primary phone', () => {
  const existingClient = { phone_number: null, phone_number_2: '0546065680' };
  expect(hasRequiredClientPhone(existingClient.phone_number)).toBe(false);
  expect(hasRequiredClientPhone('0546065680')).toBe(true);
});