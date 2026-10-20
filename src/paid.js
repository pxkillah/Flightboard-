// Paid reports in the phone app (decision 16). The app shows the free part of a report and
// sells the rest through the App Store or Google Play; the server (server/worker.js) checks
// each purchase with the store and hands out the listing history. The website sells nothing.
import { timeoutSignal } from './http.js';

// The server's address, set once it's deployed (docs/server.md), for example
// 'https://car-report-api.example.workers.dev'. While it's empty the app shows the whole
// report free, as the website does, and mobile/scripts/check-release.js refuses to ship.
export const REPORT_API = '';
// The one in-app product, a consumable: each purchase unlocks one VIN. The same ID in App
// Store Connect, Play Console and server/wrangler.toml.
export const PRODUCT_ID = 'car_report_full';

// Calls the server. Always resolves to { ok, status, body }; a network failure or timeout
// comes back as status 0 with body.error 'unreachable' or 'timeout'.
export async function askServer(path, payload, { fetch = globalThis.fetch, api = REPORT_API, timeoutMs = 30000 } = {}) {
  try {
    const res = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: timeoutSignal(timeoutMs),
    });
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, body: body && typeof body === 'object' ? body : {} };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'unreachable' } };
  }
}

export const askPreview = (vin, opts) => askServer('/v1/preview', { vin }, opts);
// vin null asks which VIN a purchase was already used for.
export const askReport = (vin, proof, opts) => askServer('/v1/report', {
  vin, platform: proof.platform, transactionId: proof.transactionId, purchaseToken: proof.purchaseToken,
}, opts);

// A purchase as the app keeps it: which store, and the store's own reference to it.
export function isProof(p) {
  return Boolean(p && typeof p === 'object'
    && ((p.platform === 'ios' && /^\d{1,30}$/.test(String(p.transactionId ?? '')))
      || (p.platform === 'android' && /^[A-Za-z0-9._-]{10,600}$/.test(String(p.purchaseToken ?? '')))));
}
export const sameProof = (a, b) => isProof(a) && isProof(b) && a.platform === b.platform
  && (a.platform === 'ios' ? String(a.transactionId) === String(b.transactionId) : a.purchaseToken === b.purchaseToken);

// What the app does with the server's answer about a purchase:
//   unlocked  it's tied to body.vin (the asked VIN, or the one it was used for); body.view is
//             the listing history, missing when MarketCheck failed (body.error says why)
//   moved     it was already used for another VIN (body.vin)
//   credit    paid, but not tied to any VIN yet (asked with no VIN)
//   rejected  refunded or not this app's product: it can't open a report
//   retry     keep it and ask again later: payment pending, store or server unreachable
export function claimOutcome(res, vin) {
  const { error, vin: bound } = res?.body ?? {};
  if (res?.ok) return 'unlocked';
  if (error === 'used' && bound) return 'moved';
  if (error === 'need-vin') return 'credit';
  if (error === 'refunded' || error === 'wrong-product' || error === 'bad-request') return 'rejected';
  if (bound && (!vin || bound === vin)) return 'unlocked';
  return 'retry';
}

// The words for a server error code, as i18n keys. Codes come from server/worker.js.
export function paidProblemKey(code) {
  return {
    unreachable: 'paid.errUnreachable',
    timeout: 'paid.errUnreachable',
    source: 'listing.unavailable',
    'source-busy': 'listing.unavailable',
    busy: 'paid.errBusy',
    pending: 'paid.errPending',
    refunded: 'paid.errRejected',
    'wrong-product': 'paid.errRejected',
    'bad-request': 'paid.errRejected',
    'not-paid': 'paid.errNotYet',
  }[code] ?? 'paid.errServer';
}
