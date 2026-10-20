// The Car Report server (server/worker.js), run in Node against a real SQLite database in
// place of Cloudflare D1, with Apple, Google and MarketCheck stubbed in their documented
// formats. Keys are generated for each run, so the signed requests are checked for real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle, cleanUp } from '../server/worker.js';
import { forgetGoogleToken, jwsPayload } from '../server/purchases.js';

const VIN = '1FTBR1X87LKA22229';
const OTHER = '1HGCM82633A004352';
const MC_KEY = 'mc-secret-0123456789abcdef';
const NOW = Date.parse('2026-10-20T12:00:00Z');
const schema = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');

// Cloudflare D1's prepare/bind/first/run, over node:sqlite.
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  return {
    raw: db,
    prepare(sql) {
      const st = db.prepare(sql);
      let args = [];
      const q = {
        bind: (...a) => { args = a; return q; },
        first: async () => st.get(...args) ?? null,
        run: async () => { st.run(...args); return { success: true }; },
        all: async () => ({ results: st.all(...args) }),
      };
      return q;
    },
  };
}

const pem = (label, buf) => `-----BEGIN ${label}-----\n${Buffer.from(buf).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
const apple = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const google = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jws = (claims) => `${b64u({ alg: 'ES256', x5c: [] })}.${b64u(claims)}.c2lnbmF0dXJl`;
async function verifyJwt(token, key, alg) {
  const [h, p, s] = token.split('.');
  const ok = await crypto.subtle.verify(alg, key, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`));
  return { ok, header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(p, 'base64url')) };
}

let env;
let stores; // what the stubbed stores and MarketCheck answer, changed by each test
let calls;
beforeEach(async () => {
  forgetGoogleToken();
  env = {
    DB: d1(),
    MARKETCHECK_API_KEY: MC_KEY,
    PRODUCT_ID: 'car_report_full',
    APPLE_BUNDLE_ID: 'com.pxkillah.carreport',
    APPLE_ISSUER_ID: 'issuer-1',
    APPLE_KEY_ID: 'KEY123',
    APPLE_PRIVATE_KEY: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', apple.privateKey)),
    GOOGLE_PACKAGE_NAME: 'com.pxkillah.carreport',
    GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'play@example.iam.gserviceaccount.com', private_key: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', google.privateKey)) }),
    ALLOWED_ORIGINS: 'capacitor://localhost,https://localhost',
    ALLOW_SANDBOX: 'true',
  };
  calls = [];
  stores = {
    listings: Array.from({ length: 3 }, (_, i) => ({ id: `L${i}`, first_seen_at_date: `2021-0${i + 1}-01T00:00:00Z`, last_seen_at_date: `2021-0${i + 1}-20T00:00:00Z`, miles: 60000 + i * 1000, price: 50000 - i * 1000, state: 'ON', inventory_type: 'used', seller_type: 'dealer', seller_name: 'Pine Tree Ford' })),
    marketcheckStatus: 200,
    apple: { Production: { '2000000111': { bundleId: 'com.pxkillah.carreport', productId: 'car_report_full', transactionId: '2000000111', type: 'Consumable' } }, Sandbox: {} },
    google: { 'tok-purchased-0123456789': { purchaseState: 0, consumptionState: 0 }, 'tok-pending-0123456789': { purchaseState: 2, consumptionState: 0 }, 'tok-cancelled-012345678': { purchaseState: 1, consumptionState: 0 } },
  };
});

const json = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function fetchStub(url, init = {}) {
  const u = new URL(url);
  calls.push({ url: u, init });
  if (u.hostname === 'api.marketcheck.com') {
    if (stores.marketcheckStatus !== 200) return json({ message: 'nope' }, stores.marketcheckStatus);
    return json(stores.listings);
  }
  const apple = { 'api.storekit.itunes.apple.com': 'Production', 'api.storekit-sandbox.itunes.apple.com': 'Sandbox' }[u.hostname];
  if (apple) {
    const t = stores.apple[apple][u.pathname.split('/').pop()];
    return t ? json({ signedTransactionInfo: jws(t) }) : json({ errorCode: 4040010 }, 404);
  }
  if (u.hostname === 'oauth2.googleapis.com') return json({ access_token: 'google-access', expires_in: 3600 });
  if (u.hostname === 'androidpublisher.googleapis.com') {
    const [token, action] = decodeURIComponent(u.pathname.split('/tokens/')[1]).split(':');
    const p = stores.google[token];
    if (!p) return json({ error: { code: 400 } }, 400);
    if (action === 'consume') { p.consumptionState = 1; return json(null, 204); }
    return json({ ...p, orderId: 'GPA.1', kind: 'androidpublisher#productPurchase' });
  }
  throw new Error(`unexpected ${url}`);
}

async function post(path, body, { origin = 'capacitor://localhost', ip = '203.0.113.9', now = NOW } = {}) {
  const res = await handle(new Request(`https://api.example.workers.dev${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }), env, { fetch: fetchStub, now });
  return { status: res.status, body: await res.json(), headers: res.headers };
}
const mcCalls = () => calls.filter((c) => c.url.hostname === 'api.marketcheck.com').length;

test('the free count comes from one MarketCheck call and is reused for a day', async () => {
  const r = await post('/v1/preview', { vin: VIN.toLowerCase() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { vin: VIN, listings: 3, more: false });
  assert.equal(mcCalls(), 1);
  assert.equal(calls[0].url.searchParams.get('api_key'), MC_KEY);
  assert.equal(calls[0].url.searchParams.get('page'), '1');
  await post('/v1/preview', { vin: VIN }, { now: NOW + 3600000 });
  assert.equal(mcCalls(), 1, 'a second check within a day is free');
  await post('/v1/preview', { vin: VIN }, { now: NOW + 86400000 + 1 });
  assert.equal(mcCalls(), 2, 'and asked again after a day');
  assert.equal(r.headers.get('access-control-allow-origin'), 'capacitor://localhost');
});

test('a full first page reads as "50 or more"', async () => {
  stores.listings = Array.from({ length: 50 }, (_, i) => ({ ...stores.listings[0], id: `L${i}` }));
  assert.deepEqual((await post('/v1/preview', { vin: VIN })).body, { vin: VIN, listings: 50, more: true });
});

test('free counts are limited per caller and in total, without storing IP addresses', async () => {
  env.PREVIEW_PER_IP_DAY = '2';
  assert.equal((await post('/v1/preview', { vin: VIN })).status, 200);
  assert.equal((await post('/v1/preview', { vin: VIN })).status, 200);
  const third = await post('/v1/preview', { vin: VIN });
  assert.deepEqual([third.status, third.body], [429, { error: 'busy' }]);
  assert.equal((await post('/v1/preview', { vin: VIN }, { ip: '198.51.100.7' })).status, 200, 'another caller is fine');
  env.PREVIEW_PER_DAY = '1';
  assert.equal((await post('/v1/preview', { vin: OTHER }, { ip: '198.51.100.8' })).status, 429, 'the daily total is spent');
  const keys = env.DB.raw.prepare('SELECT k FROM counters').all().map((r) => r.k);
  assert.ok(keys.every((k) => !k.includes('203.0.113.9') && !k.includes('198.51')), JSON.stringify(keys));
});

test('bad requests are refused before anything is called', async () => {
  assert.deepEqual((await post('/v1/preview', { vin: 'ABC' })).body, { error: 'bad-vin' });
  assert.deepEqual((await post('/v1/preview', 'not json')).body, { error: 'bad-request' });
  assert.equal((await post('/v1/preview', { vin: 'x'.repeat(5000) })).status, 413);
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'web' })).body, { error: 'bad-request' });
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '12; drop' })).body, { error: 'bad-request' });
  assert.equal(calls.length, 0);
  const res = await handle(new Request('https://x/v1/preview', { method: 'GET' }), env, { fetch: fetchStub });
  assert.equal(res.status, 404);
});

test('only the app gets CORS headers, and preflight is answered', async () => {
  const other = await post('/v1/preview', { vin: VIN }, { origin: 'https://evil.example' });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  const pre = await handle(new Request('https://x/v1/report', { method: 'OPTIONS', headers: { origin: 'https://localhost' } }), env, { fetch: fetchStub });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://localhost');
  assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);
});

test('an App Store purchase is checked with Apple, signed with the owner\'s key, and unlocks one VIN', async () => {
  const r = await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000111' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.vin, VIN);
  assert.equal(r.body.view.count, 3);
  assert.equal(r.body.view.stints[0].seller, 'Pine Tree Ford');
  const call = calls.find((c) => c.url.hostname === 'api.storekit.itunes.apple.com');
  assert.equal(call.url.pathname, '/inApps/v1/transactions/2000000111');
  const jwt = await verifyJwt(call.init.headers.authorization.replace('Bearer ', ''), apple.publicKey, { name: 'ECDSA', hash: 'SHA-256' });
  assert.ok(jwt.ok, 'the ES256 signature verifies');
  assert.deepEqual(jwt.header, { alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
  assert.equal(jwt.claims.aud, 'appstoreconnect-v1');
  assert.equal(jwt.claims.bid, 'com.pxkillah.carreport');
  assert.equal(jwt.claims.iss, 'issuer-1');

  const again = await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000111' });
  assert.equal(again.status, 200, 'the same VIN can be fetched again');
  const other = await post('/v1/report', { vin: OTHER, platform: 'ios', transactionId: '2000000111' });
  assert.deepEqual([other.status, other.body], [409, { error: 'used', vin: VIN }]);
  const lost = await post('/v1/report', { vin: null, platform: 'ios', transactionId: '2000000111' });
  assert.equal(lost.body.vin, VIN, 'with no VIN, the purchase\'s own VIN comes back');
});

test('App Store: sandbox purchases, unknown, refunded and wrong-product ones', async () => {
  stores.apple.Sandbox['2000000222'] = { bundleId: 'com.pxkillah.carreport', productId: 'car_report_full', transactionId: '2000000222', type: 'Consumable' };
  assert.equal((await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000222' })).status, 200);
  env.ALLOW_SANDBOX = 'false';
  stores.apple.Sandbox['2000000223'] = { ...stores.apple.Sandbox['2000000222'], transactionId: '2000000223' };
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000223' })).body, { error: 'not-paid' });
  stores.apple.Production['2000000333'] = { ...stores.apple.Production['2000000111'], transactionId: '2000000333', revocationDate: 1760000000000 };
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000333' })).body, { error: 'refunded' });
  stores.apple.Production['2000000444'] = { ...stores.apple.Production['2000000111'], transactionId: '2000000444', productId: 'something_else' };
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000444' })).body, { error: 'wrong-product' });
  stores.apple.Production['2000000555'] = { ...stores.apple.Production['2000000111'], transactionId: '2000000555', bundleId: 'com.someone.else' };
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000555' })).body, { error: 'wrong-product' });
  assert.deepEqual((await post('/v1/report', { vin: null, platform: 'ios', transactionId: '2000000111' })).body, { error: 'need-vin' }, 'a new purchase needs a VIN');
});

test('a Google Play purchase is checked with Google, consumed once tied to a VIN, and only its hash is kept', async () => {
  const token = 'tok-purchased-0123456789';
  const r = await post('/v1/report', { vin: VIN, platform: 'android', purchaseToken: token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const tokenCall = calls.find((c) => c.url.hostname === 'oauth2.googleapis.com');
  const assertion = new URLSearchParams(tokenCall.init.body).get('assertion');
  const jwt = await verifyJwt(assertion, google.publicKey, 'RSASSA-PKCS1-v1_5');
  assert.ok(jwt.ok, 'the RS256 signature verifies');
  assert.equal(jwt.claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
  const get = calls.find((c) => c.url.hostname === 'androidpublisher.googleapis.com');
  assert.match(get.url.pathname, /\/applications\/com\.pxkillah\.carreport\/purchases\/products\/car_report_full\/tokens\//);
  assert.equal(get.init.headers.authorization, 'Bearer google-access');
  assert.equal(stores.google[token].consumptionState, 1, 'consumed');
  const stored = env.DB.raw.prepare('SELECT txn FROM unlocks').all();
  assert.equal(stored.length, 1);
  assert.ok(!stored[0].txn.includes(token) && /^android:[0-9a-f]{64}$/.test(stored[0].txn));
  const consumes = () => calls.filter((c) => c.url.pathname.endsWith(':consume')).length;
  await post('/v1/report', { vin: VIN, platform: 'android', purchaseToken: token });
  assert.equal(consumes(), 1, 'not consumed twice');
  assert.equal(calls.filter((c) => c.url.hostname === 'oauth2.googleapis.com').length, 1, 'the access token is reused');
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'android', purchaseToken: 'tok-pending-0123456789' })).body, { error: 'pending' });
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'android', purchaseToken: 'tok-cancelled-012345678' })).body, { error: 'refunded' });
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'android', purchaseToken: 'tok-unknown-0123456789' })).body, { error: 'not-paid' });
});

test('one purchase can fetch its report again only a few times a day', async () => {
  env.REPORT_FETCHES_PER_DAY = '2';
  const body = { vin: VIN, platform: 'ios', transactionId: '2000000111' };
  assert.equal((await post('/v1/report', body)).status, 200);
  assert.equal((await post('/v1/report', body)).status, 200);
  assert.deepEqual((await post('/v1/report', body)).body, { error: 'busy', vin: VIN });
  assert.equal((await post('/v1/report', body, { now: NOW + 86400000 })).status, 200, 'and again the next day');
});

test('MarketCheck problems are reported without the key, and a refused key is the owner\'s to fix', async () => {
  stores.marketcheckStatus = 401;
  const r = await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000111' });
  assert.deepEqual([r.status, r.body], [500, { error: 'config', vin: VIN }]);
  stores.marketcheckStatus = 429;
  assert.equal((await post('/v1/preview', { vin: VIN })).body.error, 'source-busy');
  stores.marketcheckStatus = 200;
  const ok = await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000111' });
  assert.equal(ok.status, 200, 'the purchase still works once MarketCheck is back');
  assert.doesNotMatch(JSON.stringify([r.body, ok.body]), new RegExp(MC_KEY));
});

test('logs never carry a VIN or a key', async (t) => {
  const lines = [];
  t.mock.method(console, 'error', (...a) => lines.push(a.join(' ')));
  stores.marketcheckStatus = 500;
  await post('/v1/preview', { vin: VIN });
  stores.marketcheckStatus = 401;
  await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000111' });
  assert.ok(lines.length >= 2, JSON.stringify(lines));
  for (const l of lines) {
    assert.doesNotMatch(l, new RegExp(VIN));
    assert.doesNotMatch(l, new RegExp(MC_KEY));
  }
});

test('missing settings are a server problem, not the buyer\'s', async () => {
  delete env.APPLE_PRIVATE_KEY;
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000111' })).body, { error: 'config' });
  env.GOOGLE_SERVICE_ACCOUNT = 'not json';
  assert.deepEqual((await post('/v1/report', { vin: VIN, platform: 'android', purchaseToken: 'tok-purchased-0123456789' })).body, { error: 'config' });
  delete env.MARKETCHECK_API_KEY;
  assert.deepEqual((await post('/v1/preview', { vin: VIN })).body, { error: 'config' });
});

test('the daily clean-up drops old counters and counts, never purchases', async () => {
  await post('/v1/preview', { vin: VIN });
  await post('/v1/report', { vin: VIN, platform: 'ios', transactionId: '2000000111' });
  await cleanUp(env, NOW + 3 * 86400000);
  const count = (t) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  assert.deepEqual([count('counters'), count('previews'), count('unlocks')], [0, 0, 1]);
});

test('a JWS payload decodes, including non-ASCII text', () => {
  assert.deepEqual(jwsPayload(jws({ a: 'é' })), { a: 'é' });
});
