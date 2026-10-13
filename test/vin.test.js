import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVin, checkDigit } from '../src/vin.js';

test('accepts a VIN with a correct check digit', () => {
  // Standard example VIN from 49 CFR 565 / vPIC docs.
  const r = validateVin('1hgcm82633a004352');
  assert.equal(r.valid, true);
  assert.equal(r.vin, '1HGCM82633A004352');
});

test('X check digit', () => {
  assert.equal(checkDigit('11111111111111111'), '1');
  assert.equal(validateVin('1M8GDM9AXKP042788').valid, true);
});

test('rejects bad length, letters and check digit', () => {
  assert.match(validateVin('ABC').errors[0], /17 characters/);
  assert.ok(validateVin('1HGCM82633A00435O').errors.some((e) => /I, O or Q/.test(e)));
  assert.ok(validateVin('1HGCM82643A004352').errors.some((e) => /check digit/.test(e)));
});
