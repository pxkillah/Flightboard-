import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVin, checkDigit, vinFromScan } from '../src/vin.js';

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

test('full-width and invisible characters are cleaned up', async () => {
  const { normalizeVin } = await import('../src/vin.js');
  assert.equal(normalizeVin('１ＨＧＣＭ８２６３３Ａ００４３５２'), '1HGCM82633A004352');
  assert.equal(normalizeVin('1HGCM8263​3A004352﻿'), '1HGCM82633A004352');
});

test('the VIN is picked out of a barcode scan', () => {
  assert.equal(vinFromScan(['1HGCM82633A004352']), '1HGCM82633A004352');
  assert.equal(vinFromScan('I1HGCM82633A004352'), '1HGCM82633A004352', 'Code 39 import prefix');
  assert.equal(vinFromScan(' 1hgcm82633a004352\n'), '1HGCM82633A004352');
  assert.equal(vinFromScan(['MFG 05/03', 'VIN:1HGCM82633A004353;1HGCM82633A004352']), '1HGCM82633A004352', 'a matching check digit wins');
  assert.equal(vinFromScan('1HGCM82633A004353'), '1HGCM82633A004353', 'otherwise the first candidate, to show and fix');
  assert.equal(vinFromScan(['ABC', '1HGCM82633A0043521', '1HGCM82633A00435O']), null);
  assert.equal(vinFromScan(null), null);
});
