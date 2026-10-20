// The app's side of paid reports (src/paid.js): what it does with each server answer, and the
// settings that must agree across the app, the server and the page's security policy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPORT_API, PRODUCT_ID, askServer, askReport, isProof, sameProof, claimOutcome, paidProblemKey } from '../src/paid.js';
import { MESSAGES } from '../src/i18n.js';

const VIN = '1FTBR1X87LKA22229';
const ios = { platform: 'ios', transactionId: '2000000111' };
const android = { platform: 'android', purchaseToken: 'tok-purchased-0123456789' };
const res = (ok, body) => ({ ok, status: ok ? 200 : 409, body });

test('each server answer settles a purchase the right way', () => {
  assert.equal(claimOutcome(res(true, { vin: VIN, view: {} }), VIN), 'unlocked');
  assert.equal(claimOutcome(res(false, { error: 'used', vin: '1HGCM82633A004352' }), VIN), 'moved');
  assert.equal(claimOutcome(res(false, { error: 'need-vin' }), null), 'credit');
  for (const error of ['refunded', 'wrong-product', 'bad-request']) assert.equal(claimOutcome(res(false, { error }), VIN), 'rejected', error);
  assert.equal(claimOutcome(res(false, { error: 'source', vin: VIN }), VIN), 'unlocked', 'tied to the VIN, but MarketCheck failed');
  assert.equal(claimOutcome(res(false, { error: 'config', vin: VIN }), null), 'unlocked', 'recovered with no VIN');
  for (const error of ['pending', 'not-paid', 'store', 'unreachable', 'timeout', 'server', 'busy']) {
    assert.equal(claimOutcome(res(false, { error }), VIN), 'retry', `${error}: the purchase is kept`);
  }
});

test('a saved purchase is checked before it is used', () => {
  assert.ok(isProof(ios) && isProof(android));
  for (const bad of [null, {}, { platform: 'ios', transactionId: 'abc' }, { platform: 'android', purchaseToken: '<script>' }, { platform: 'web', transactionId: '1' }]) {
    assert.equal(isProof(bad), false, JSON.stringify(bad));
  }
  assert.ok(sameProof(ios, { ...ios, confirmed: true, accountToken: 'x' }));
  assert.equal(sameProof(ios, { platform: 'ios', transactionId: '2000000112' }), false);
  assert.equal(sameProof(ios, android), false);
});

test('the server is called with the purchase, and a network failure never throws', async () => {
  let sent;
  const fetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ vin: VIN }), { status: 200 }); };
  const ok = await askReport(VIN, { ...android, accountToken: 'secret-ish' }, { fetch, api: 'https://api.example' });
  assert.equal(sent.url, 'https://api.example/v1/report');
  assert.deepEqual(JSON.parse(sent.init.body), { vin: VIN, platform: 'android', purchaseToken: android.purchaseToken }, 'the account token stays on the phone');
  assert.deepEqual(ok, { ok: true, status: 200, body: { vin: VIN } });
  const down = await askServer('/v1/preview', { vin: VIN }, { fetch: async () => { throw new TypeError('Failed to fetch'); }, api: 'https://api.example' });
  assert.deepEqual(down, { ok: false, status: 0, body: { error: 'unreachable' } });
  const html = await askServer('/v1/preview', {}, { fetch: async () => new Response('<html>', { status: 502 }), api: 'https://api.example' });
  assert.deepEqual(html, { ok: false, status: 502, body: {} });
});

test('every server error has words in both languages', () => {
  for (const code of ['unreachable', 'timeout', 'source', 'source-busy', 'busy', 'pending', 'refunded', 'wrong-product', 'bad-request', 'not-paid', 'config', 'server', 'store', 'anything-new']) {
    const key = paidProblemKey(code);
    assert.ok(key in MESSAGES.en && key in MESSAGES.fr, `${code} → ${key}`);
  }
});

test('the app, the server and the security policy agree on the product and the address', () => {
  const wrangler = readFileSync(new URL('../server/wrangler.toml', import.meta.url), 'utf8');
  assert.equal(wrangler.match(/^PRODUCT_ID = "([^"]+)"/m)?.[1], PRODUCT_ID);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const connect = html.match(/connect-src ([^;]+);/)[1].split(/\s+/);
  if (REPORT_API) {
    assert.match(REPORT_API, /^https:\/\/[^/]+$/, 'an https origin with no path or trailing slash');
    assert.ok(connect.includes(REPORT_API), 'the page may call the server');
  } else {
    assert.ok(!connect.some((c) => /workers\.dev/.test(c)), 'no server in the policy until one is set');
  }
});
