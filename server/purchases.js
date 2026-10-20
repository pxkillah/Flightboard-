// Checks an App Store or Google Play purchase with Apple or Google before a paid report is
// handed out. The phone only says which purchase it made; the server asks the store itself,
// with the owner's credentials (Worker secrets), so nothing the phone sends is trusted alone.
// Runs in Cloudflare Workers and in Node (tests): fetch and Web Crypto only.
import { timeoutSignal } from '../src/http.js';

// What went wrong, as a short code the app turns into words, and the HTTP status to send.
export class ApiError extends Error {
  constructor(code, status, extra = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pemBytes = (pem) => Uint8Array.from(atob(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));

export async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A signed JWT. ES256 (Apple) or RS256 (Google), from a PKCS#8 PEM private key. Web Crypto
// returns ECDSA signatures as r||s, which is the form JWS expects.
export async function signJwt(header, claims, pem) {
  const es = header.alg === 'ES256';
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(pem),
    es ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const sig = await crypto.subtle.sign(es ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5', key, enc.encode(input));
  return `${input}.${b64url(sig)}`;
}

// The claims in a JWS. Apple's transaction comes straight from Apple's API over HTTPS with the
// owner's credentials, so its signature isn't checked again here.
export function jwsPayload(jws) {
  const part = String(jws ?? '').split('.')[1];
  if (!part) throw new ApiError('store', 502);
  const bin = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

function need(env, ...names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    console.error('missing settings:', missing.join(', '));
    throw new ApiError('config', 500);
  }
}

const call = (fetch, url, init = {}) => fetch(url, { ...init, signal: timeoutSignal(15000) }).catch(() => {
  throw new ApiError('store', 502);
});

// ---------- App Store ----------
const APPLE = {
  Production: 'https://api.storekit.itunes.apple.com',
  Sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
};

// App Store Server API, Get Transaction Info. TestFlight and App Review buy in the sandbox, so
// a transaction Apple's production servers don't know is looked up there too (ALLOW_SANDBOX).
export async function verifyApple({ transactionId } = {}, env, { fetch = globalThis.fetch, now = Date.now() } = {}) {
  const id = String(transactionId ?? '');
  if (!/^\d{1,30}$/.test(id)) throw new ApiError('bad-request', 400);
  need(env, 'APPLE_ISSUER_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_BUNDLE_ID', 'PRODUCT_ID');
  const iat = Math.floor(now / 1000);
  const token = await signJwt({ alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' },
    { iss: env.APPLE_ISSUER_ID, iat, exp: iat + 600, aud: 'appstoreconnect-v1', bid: env.APPLE_BUNDLE_ID }, env.APPLE_PRIVATE_KEY);
  for (const where of env.ALLOW_SANDBOX === 'true' ? ['Production', 'Sandbox'] : ['Production']) {
    const res = await call(fetch, `${APPLE[where]}/inApps/v1/transactions/${id}`, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 404) continue;
    if (res.status === 401) {
      console.error('Apple refused the App Store Server API key');
      throw new ApiError('config', 500);
    }
    if (!res.ok) throw new ApiError('store', 502);
    const t = jwsPayload((await res.json())?.signedTransactionInfo);
    if (t.bundleId !== env.APPLE_BUNDLE_ID || t.productId !== env.PRODUCT_ID || String(t.transactionId) !== id) throw new ApiError('wrong-product', 403);
    if (t.revocationDate) throw new ApiError('refunded', 403);
    return { key: `ios:${id}`, platform: 'ios' };
  }
  throw new ApiError('not-paid', 402);
}

// ---------- Google Play ----------
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
let googleAccess = null; // { token, until, email }: reused while this Worker instance lives

async function googleToken(env, { fetch, now }) {
  let sa;
  try { sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT); } catch { sa = null; }
  if (!sa?.client_email || !sa?.private_key) {
    console.error('GOOGLE_SERVICE_ACCOUNT is not a service account key file');
    throw new ApiError('config', 500);
  }
  if (googleAccess?.email === sa.client_email && googleAccess.until > now + 60000) return googleAccess.token;
  const iat = Math.floor(now / 1000);
  const assertion = await signJwt({ alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: GOOGLE_TOKEN, iat, exp: iat + 3600 }, sa.private_key);
  const res = await call(fetch, GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) {
    console.error('Google refused the service account', res.status);
    throw new ApiError(res.status >= 500 ? 'store' : 'config', res.status >= 500 ? 502 : 500);
  }
  const { access_token: token, expires_in: secs } = await res.json();
  googleAccess = { token, until: now + (Number(secs) || 3600) * 1000, email: sa.client_email };
  return token;
}
export const forgetGoogleToken = () => { googleAccess = null; };

// Play Developer API, purchases.products.get. The URL names this app and product, so a token
// from anything else isn't found. The raw token is never stored, only its hash. consume() lets
// the person buy another report; it's called once the purchase is tied to a VIN.
export async function verifyGoogle({ purchaseToken } = {}, env, { fetch = globalThis.fetch, now = Date.now() } = {}) {
  const token = String(purchaseToken ?? '');
  if (!/^[A-Za-z0-9._-]{10,600}$/.test(token)) throw new ApiError('bad-request', 400);
  need(env, 'GOOGLE_SERVICE_ACCOUNT', 'GOOGLE_PACKAGE_NAME', 'PRODUCT_ID');
  const url = `${PUBLISHER}/${encodeURIComponent(env.GOOGLE_PACKAGE_NAME)}/purchases/products/${encodeURIComponent(env.PRODUCT_ID)}/tokens/${encodeURIComponent(token)}`;
  const headers = { authorization: `Bearer ${await googleToken(env, { fetch, now })}` };
  const res = await call(fetch, url, { headers });
  if ([400, 404, 410].includes(res.status)) throw new ApiError('not-paid', 402);
  if (res.status === 401 || res.status === 403) {
    console.error('Google refused the purchase lookup', res.status);
    throw new ApiError('config', 500);
  }
  if (!res.ok) throw new ApiError('store', 502);
  const p = await res.json();
  // purchaseState: 0 purchased, 1 cancelled, 2 pending (for example, paying cash at a store).
  if (p.purchaseState === 1) throw new ApiError('refunded', 403);
  if (p.purchaseState === 2) throw new ApiError('pending', 402);
  if (p.purchaseState !== 0) throw new ApiError('not-paid', 402);
  return {
    key: `android:${await sha256hex(token)}`,
    platform: 'android',
    consume: p.consumptionState === 0 ? async () => {
      const r = await call(fetch, `${url}:consume`, { method: 'POST', headers });
      if (!r.ok) console.error('Google consume failed', r.status);
    } : null,
  };
}

export function verifyPurchase(body, env, deps) {
  if (body?.platform === 'ios') return verifyApple(body, env, deps);
  if (body?.platform === 'android') return verifyGoogle(body, env, deps);
  throw new ApiError('bad-request', 400);
}
