// The Car Report server, a Cloudflare Worker (decision 16). It's the only place the owner's
// MarketCheck key and store credentials live; the app never sees them.
//
//   POST /v1/preview { vin }                  free: how many listings MarketCheck has
//   POST /v1/report  { vin, platform, ... }   paid: the listing history, once Apple or Google
//                                             confirms the purchase. platform 'ios' sends
//                                             transactionId; 'android' sends purchaseToken.
//                                             Each purchase unlocks one VIN, for good.
//   GET  /v1/health
//
// Errors are { error: code } with an HTTP status; the app turns the code into words.
import { history, summarizeHistory, historyView } from '../src/sources/marketcheck.js';
import { HttpError } from '../src/http.js';
import { normalizeVin } from '../src/vin.js';
import { ApiError, verifyPurchase, sha256hex } from './purchases.js';

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const DAY_MS = 86400000;
const MAX_BODY = 4096;
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : fallback);
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: (event, env) => cleanUp(env),
};

// Only the app's own web view origins get CORS headers. CORS doesn't stop other callers;
// the purchase check and the rate limits do.
function cors(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' };
}

export async function handle(request, env, { fetch = globalThis.fetch, now = Date.now() } = {}) {
  const headers = cors(request.headers.get('origin'), env);
  const reply = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  });
  const { pathname } = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
  }
  try {
    if (request.method === 'GET' && pathname === '/v1/health') return reply(200, { ok: true });
    if (request.method !== 'POST' || !['/v1/preview', '/v1/report'].includes(pathname)) return reply(404, { error: 'not-found' });
    const body = await readJson(request);
    const deps = { fetch, now, ip: request.headers.get('cf-connecting-ip') ?? '' };
    return reply(200, pathname === '/v1/preview' ? await preview(body, env, deps) : await report(body, env, deps));
  } catch (e) {
    if (e instanceof ApiError) return reply(e.status, { error: e.code, ...e.extra });
    // MarketCheck errors arrive with the key already scrubbed (src/sources/marketcheck.js).
    console.error('unexpected error', e?.name, e?.message);
    return reply(500, { error: 'server' });
  }
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new ApiError('bad-request', 413);
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* falls through */ }
  throw new ApiError('bad-request', 400);
}

function readVin(raw, { optional = false } = {}) {
  if (optional && (raw === null || raw === undefined)) return null;
  const vin = normalizeVin(raw);
  if (!VIN.test(vin)) throw new ApiError('bad-vin', 400);
  return vin;
}

function marketCheckKey(env) {
  if (!env.MARKETCHECK_API_KEY) {
    console.error('missing settings: MARKETCHECK_API_KEY');
    throw new ApiError('config', 500);
  }
  return env.MARKETCHECK_API_KEY;
}

// MarketCheck refusing the owner's key is the owner's problem to fix, not the buyer's.
function sourceError(e, extra = {}) {
  if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
    console.error('MarketCheck refused the key', e.status);
    return new ApiError('config', 500, extra);
  }
  if (e instanceof HttpError && (e.status === 402 || e.status === 429)) {
    console.error('MarketCheck says the plan is out of calls', e.status);
    return new ApiError('source-busy', 503, extra);
  }
  console.error('MarketCheck failed', e?.name, e?.message);
  return new ApiError('source', 502, extra);
}

async function bump(db, k, day) {
  const row = await db.prepare('INSERT INTO counters (k, day, n) VALUES (?, ?, 1) ON CONFLICT (k, day) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(k, day).first();
  return row.n;
}

// The free count. Each new count costs the owner a MarketCheck call, so callers are limited
// per day (by a hash of their IP address, keyed with a secret so it can't be reversed), and
// so is the total.
async function preview(body, env, { fetch, now, ip }) {
  const vin = readVin(body.vin);
  const day = utcDay(now);
  const apiKey = marketCheckKey(env);
  const caller = await sha256hex(`${day}|${ip}|${apiKey}`);
  if (await bump(env.DB, `ip:${caller}`, day) > num(env.PREVIEW_PER_IP_DAY, 20)) throw new ApiError('busy', 429);
  const cached = await env.DB.prepare('SELECT listings, more, at FROM previews WHERE vin = ?').bind(vin).first();
  if (cached && now - cached.at < DAY_MS) return { vin, listings: cached.listings, more: Boolean(cached.more) };
  if (await bump(env.DB, 'all', day) > num(env.PREVIEW_PER_DAY, 500)) throw new ApiError('busy', 429);
  let list;
  try {
    list = await history(vin, { apiKey, maxPages: 1, fetch });
  } catch (e) {
    throw sourceError(e);
  }
  // One page is 50 listings; past that, the count is "50 or more" until someone buys.
  const more = list.length >= 50;
  await env.DB.prepare('INSERT INTO previews (vin, listings, more, at) VALUES (?, ?, ?, ?) ON CONFLICT (vin) DO UPDATE SET listings = excluded.listings, more = excluded.more, at = excluded.at')
    .bind(vin, list.length, more ? 1 : 0, now).run();
  return { vin, listings: list.length, more };
}

// The paid part. The purchase is confirmed with the store every time, so a refunded one
// stops working. The first VIN asked for is tied to the purchase; asking with no VIN returns
// that one, which is how the app recovers a purchase whose VIN it lost.
async function report(body, env, { fetch, now }) {
  const asked = readVin(body.vin, { optional: true });
  const purchase = await verifyPurchase(body, env, { fetch, now });
  const db = env.DB;
  let row = await db.prepare('SELECT vin FROM unlocks WHERE txn = ?').bind(purchase.key).first();
  if (!row) {
    if (!asked) throw new ApiError('need-vin', 409);
    await db.prepare('INSERT INTO unlocks (txn, vin, platform, created) VALUES (?, ?, ?, ?) ON CONFLICT (txn) DO NOTHING')
      .bind(purchase.key, asked, purchase.platform, now).run();
    // Re-read: if two requests raced with different VINs, the first one written wins.
    row = await db.prepare('SELECT vin FROM unlocks WHERE txn = ?').bind(purchase.key).first();
  }
  if (asked && row.vin !== asked) throw new ApiError('used', 409, { vin: row.vin });
  if (purchase.consume) await purchase.consume();
  const day = utcDay(now);
  const { fetches } = await db.prepare('UPDATE unlocks SET fetches = CASE WHEN day = ? THEN fetches + 1 ELSE 1 END, day = ? WHERE txn = ? RETURNING fetches')
    .bind(day, day, purchase.key).first();
  if (fetches > num(env.REPORT_FETCHES_PER_DAY, 5)) throw new ApiError('busy', 429, { vin: row.vin });
  let view;
  try {
    view = historyView(summarizeHistory(await history(row.vin, { apiKey: marketCheckKey(env), maxPages: 4, fetch })));
  } catch (e) {
    throw sourceError(e, { vin: row.vin });
  }
  return { vin: row.vin, view, at: now };
}

// Daily (wrangler.toml cron): drops counters older than yesterday and counts older than a day.
export async function cleanUp(env, now = Date.now()) {
  await env.DB.prepare('DELETE FROM counters WHERE day < ?').bind(utcDay(now - DAY_MS)).run();
  await env.DB.prepare('DELETE FROM previews WHERE at < ?').bind(now - DAY_MS).run();
}
