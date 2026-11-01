// Car Report's GlobalVIN proxy: a Cloudflare Worker that holds the GlobalVIN API key as a
// secret, so the page and the apps never see it. The page POSTs { vin } here; the Worker adds
// the key and forwards to GlobalVIN, whose API takes the key in the JSON body.
//
//   POST /v1/api/vin  { "vin": "1FTFW1ET5DFC10312" }
//
// Responses: GlobalVIN's status and body passed through (2xx answers cached per VIN in
// caches.default for CACHE_TTL_SECONDS, with X-Cache: HIT or MISS); 400 bad JSON or VIN;
// 404 other paths; 405 other methods; 429 over the optional per-IP rate limit; 500 when
// GLOBALVIN_BASE_URL or the GLOBALVIN_API_KEY secret is missing; 502 when GlobalVIN can't be
// reached. Errors are JSON: { "error": "..." }.
//
// ALLOWED_ORIGINS only controls which websites a browser lets read the answer. It doesn't stop
// a script calling the Worker directly; the RATE_LIMITER binding in wrangler.toml is what
// limits how fast anyone can spend the owner's GlobalVIN calls.

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const PATH = '/v1/api/vin';
const DEFAULT_TTL = 86400;
const UPSTREAM_TIMEOUT_MS = 15000;

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  const h = new Headers({ Vary: 'Origin' });
  let allow = null;
  if (allowed.length === 0 || allowed.includes('*')) allow = '*';
  else if (origin && allowed.includes(origin)) allow = origin;
  if (allow) {
    h.set('Access-Control-Allow-Origin', allow);
    h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type');
    h.set('Access-Control-Expose-Headers', 'X-Cache');
    h.set('Access-Control-Max-Age', '86400');
  }
  return h;
}

function withHeaders(response, extra) {
  const res = new Response(response.body, response);
  for (const [k, v] of extra) res.headers.set(k, v);
  return res;
}

const json = (status, body, headers = new Headers()) => {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: h });
};

export function normalizeVin(x) {
  return typeof x === 'string' ? x.trim().toUpperCase() : '';
}

function ttlOf(env) {
  const n = Number(env.CACHE_TTL_SECONDS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_TTL;
}

// The cache key is a synthetic GET URL per VIN on the Worker's own host; the key never goes in it.
const cacheKey = (request, vin) => new Request(`${new URL(request.url).origin}${PATH}/${vin}`, { method: 'GET' });

export async function handle(request, env = {}, ctx = {}, { fetch = globalThis.fetch, cache = globalThis.caches?.default } = {}) {
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);
  if (url.pathname !== PATH) return json(404, { error: 'Not found' }, cors);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') {
    const h = new Headers(cors);
    h.set('Allow', 'POST, OPTIONS');
    return json(405, { error: 'Method not allowed' }, h);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Request body must be JSON' }, cors);
  }
  const vin = normalizeVin(body?.vin);
  if (!VIN_RE.test(vin)) return json(400, { error: 'VIN must be 17 letters and digits, without I, O or Q' }, cors);

  const base = String(env.GLOBALVIN_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (!base || !/^https:\/\//.test(base) || !env.GLOBALVIN_API_KEY) {
    return json(500, { error: 'GlobalVIN lookup is not configured' }, cors);
  }

  if (env.RATE_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json(429, { error: 'Too many lookups. Try again in a minute.' }, cors);
  }

  const key = cacheKey(request, vin);
  const hit = cache && await cache.match(key);
  if (hit) return withHeaders(hit, [...cors, ['X-Cache', 'HIT']]);

  let upstream;
  try {
    upstream = await fetch(`${base}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ vin, api_key: env.GLOBALVIN_API_KEY }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json(502, { error: 'Could not reach GlobalVIN' }, cors);
  }

  // Should GlobalVIN ever echo the request back, the key mustn't reach the browser or the cache.
  const text = (await upstream.text()).split(env.GLOBALVIN_API_KEY).join('[key]');
  const h = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8' });
  if (upstream.ok) {
    const ttl = ttlOf(env);
    h.set('Cache-Control', `public, max-age=${ttl}`);
    if (cache && ttl > 0) {
      const put = cache.put(key, new Response(text, { status: upstream.status, headers: h }));
      if (typeof ctx.waitUntil === 'function') ctx.waitUntil(put); else await put;
    }
  } else {
    h.set('Cache-Control', 'no-store');
  }
  for (const [k, v] of cors) h.set(k, v);
  h.set('X-Cache', 'MISS');
  return new Response(text, { status: upstream.status, headers: h });
}

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
};
