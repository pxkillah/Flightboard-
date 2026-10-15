// VIN validation per 49 CFR 565 (North American 17-character VINs).
const TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// NFKC turns full-width letters from East Asian keyboards into plain ones, and pasted text
// can carry invisible zero-width characters.
export function normalizeVin(vin) {
  return String(vin ?? '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim().toUpperCase().replace(/[\s-]/g, '');
}

export function checkDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = /\d/.test(c) ? Number(c) : TRANSLIT[c];
    if (v === undefined) return null;
    sum += v * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}

// Returns { valid, vin, errors[] }. A bad check digit is reported as an error but
// non-NA VINs (e.g. some European imports) legitimately skip it, so callers may
// still choose to decode.
export function validateVin(input) {
  const vin = normalizeVin(input);
  const errors = [];
  if (vin.length !== 17) errors.push(`VIN must be 17 characters (got ${vin.length})`);
  if (/[IOQ]/.test(vin)) errors.push('VIN cannot contain I, O or Q');
  if (!/^[A-HJ-NPR-Z0-9]*$/.test(vin.replace(/[IOQ]/g, ''))) errors.push('VIN contains invalid characters');
  if (errors.length === 0) {
    const expected = checkDigit(vin);
    if (expected !== vin[8]) errors.push(`check digit mismatch (position 9 is ${vin[8]}, expected ${expected})`);
  }
  return { valid: errors.length === 0, vin, errors };
}
