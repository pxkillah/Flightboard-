// The GlobalVIN Worker (workers/globalvin) and the page's client for it (src/sources/globalvin.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../workers/globalvin/src/index.js';
import { lookupVin, globalVinFields } from '../src/sources/globalvin.js';
import { HttpError, FormatError, errorKind } from '../src/http.js';

const VIN = '1FTFW1ET5DFC10312';
const ENV = { GLOBALVIN_BASE_URL: 'https://gv.example/', GLOBALVIN_API_KEY: 'sekret-key', ALLOWED_ORIGINS: '*', CACHE_TTL_SECONDS: '600' };
const URL_ = 'https://worker.example/v1/api/vin';

function memCache() {
  const m = new Map();
  return { m, match: async (req) => m.get(req.url)?.clone(), put: async (req, res) => { m.set(req.url, res.clone()); } };
}
function upstream(status = 200, body = { vin: VIN, make: 'FORD' }) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); };
  return { fetch, calls };
}
const post = (body, headers = {}) => new Request(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('worker forwards a normalized VIN with the key in the body and passes the answer through', async () => {
  const up = upstream();
  const res = await handle(post({ vin: `  ${VIN.toLowerCase()} ` }), ENV, {}, { fetch: up.fetch, cache: memCache() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { vin: VIN, make: 'FORD' });
  assert.equal(up.calls[0].url, 'https://gv.example/v1/api/vin');
  assert.equal(up.calls[0].init.method, 'POST');
  assert.deepEqual(up.calls[0].body, { vin: VIN, api_key: 'sekret-key' });
  assert.equal(res.headers.get('X-Cache'), 'MISS');
});

test('worker caches successful answers per VIN', async () => {
  const up = upstream();
  const cache = memCache();
  await handle(post({ vin: VIN }), ENV, {}, { fetch: up.fetch, cache });
  const again = await handle(post({ vin: VIN }), ENV, {}, { fetch: up.fetch, cache });
  assert.equal(again.headers.get('X-Cache'), 'HIT');
  assert.equal(up.calls.length, 1);
  assert.ok([...cache.m.keys()].every((k) => !k.includes('sekret')), 'the key is never in a cache key');
});

test('worker passes errors through without caching them', async () => {
  const up = upstream(401, { error: 'invalid api key' });
  const cache = memCache();
  const res = await handle(post({ vin: VIN }), ENV, {}, { fetch: up.fetch, cache });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'invalid api key' });
  assert.equal(cache.m.size, 0);
});

test('worker never returns the key, even if GlobalVIN echoes it', async () => {
  const up = upstream(200, { api_key: 'sekret-key', vin: VIN });
  const res = await handle(post({ vin: VIN }), ENV, {}, { fetch: up.fetch, cache: memCache() });
  assert.doesNotMatch(await res.text(), /sekret-key/);
});

test('worker rejects bad requests', async () => {
  const opts = { fetch: upstream().fetch, cache: memCache() };
  const cases = [
    [post('not json'), 400],
    [post({ vin: '1FTFW1ET5DFC1031O' }), 400],
    [post({ vin: 'SHORT' }), 400],
    [post({}), 400],
    [new Request(URL_, { method: 'GET' }), 405],
    [new Request('https://worker.example/other', { method: 'POST', body: '{}' }), 404],
  ];
  for (const [req, status] of cases) {
    const res = await handle(req, ENV, {}, opts);
    assert.equal(res.status, status, `${req.method} ${req.url}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }
});

test('worker answers 500 when not configured and 502 when GlobalVIN is unreachable', async () => {
  const opts = { fetch: upstream().fetch, cache: memCache() };
  assert.equal((await handle(post({ vin: VIN }), { ...ENV, GLOBALVIN_BASE_URL: '' }, {}, opts)).status, 500);
  assert.equal((await handle(post({ vin: VIN }), { ...ENV, GLOBALVIN_API_KEY: undefined }, {}, opts)).status, 500);
  const down = async () => { throw new TypeError('fetch failed'); };
  assert.equal((await handle(post({ vin: VIN }), ENV, {}, { fetch: down, cache: memCache() })).status, 502);
});

test('worker CORS: preflight, allowed origins echoed, Vary: Origin', async () => {
  const env = { ...ENV, ALLOWED_ORIGINS: 'https://pxkillah.github.io, capacitor://localhost' };
  const pre = await handle(new Request(URL_, { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'capacitor://localhost');
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  assert.equal(pre.headers.get('Vary'), 'Origin');
  const other = await handle(new Request(URL_, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  const any = await handle(post({ vin: VIN }, { Origin: 'https://a.example' }), ENV, {}, { fetch: upstream().fetch, cache: memCache() });
  assert.equal(any.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(any.headers.get('Vary'), 'Origin');
});

test('worker applies the rate limit when bound', async () => {
  const env = { ...ENV, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const up = upstream();
  const res = await handle(post({ vin: VIN }), env, {}, { fetch: up.fetch, cache: memCache() });
  assert.equal(res.status, 429);
  assert.equal(up.calls.length, 0);
});

test('lookupVin posts { vin } to the Worker and returns its JSON', async () => {
  let seen;
  const fetch = async (url, init) => { seen = { url, init }; return new Response('{"make":"FORD"}', { status: 200 }); };
  assert.deepEqual(await lookupVin(VIN, { workerUrl: 'https://w.example/', fetch }), { make: 'FORD' });
  assert.equal(seen.url, 'https://w.example/v1/api/vin');
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { vin: VIN });
  assert.doesNotMatch(seen.init.body, /api_key/);
});

test('lookupVin throws the returned error on non-2xx', async () => {
  const fetch = async () => new Response('{"error":"VIN must be 17 letters"}', { status: 400 });
  await assert.rejects(lookupVin('X', { workerUrl: 'https://w.example', fetch }), (e) => e instanceof HttpError && e.status === 400 && e.message === 'VIN must be 17 letters');
  const down = async () => new Response('{"error":"Could not reach GlobalVIN"}', { status: 502 });
  await assert.rejects(lookupVin(VIN, { workerUrl: 'https://w.example', fetch: down }), (e) => errorKind(e) === 'unavailable');
  const html = async () => new Response('<html>', { status: 200 });
  await assert.rejects(lookupVin(VIN, { workerUrl: 'https://w.example', fetch: html }), FormatError);
  await assert.rejects(lookupVin(VIN, { workerUrl: '' }), /not set up/);
});

test('globalVinFields flattens an answer into labelled text', () => {
  assert.deepEqual(globalVinFields({ make: 'FORD', model_year: 2013, engine: { fuelType: 'Gas', cylinders: 6 }, empty: '', none: null, tags: ['a', 'b'] }), [
    ['make', 'FORD'], ['model year', '2013'], ['engine · fuel Type', 'Gas'], ['engine · cylinders', '6'], ['tags', 'a, b'],
  ]);
  assert.deepEqual(globalVinFields(null), []);
  assert.equal(globalVinFields(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i]))).length, 60);
});
