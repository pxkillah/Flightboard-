// GlobalVIN lookups, through the owner's Cloudflare Worker (workers/globalvin, decision 17).
// GlobalVIN's API takes its key in the request body, so the page never calls GlobalVIN itself:
// it POSTs { vin } to the Worker, which adds the key it holds as a secret.
import { HttpError, FormatError, timeoutSignal } from '../http.js';

// The deployed Worker's address, e.g. 'https://car-report-globalvin.<account>.workers.dev'.
// Empty means the page hides GlobalVIN. Setting it also means adding its origin to
// connect-src in index.html's Content-Security-Policy (test/page.test.js checks both match).
export const WORKER_URL = '';

// POSTs { vin } to the Worker and returns GlobalVIN's JSON answer. A non-2xx answer throws an
// HttpError whose message is the `error` the Worker or GlobalVIN returned, so errorKind works.
export async function lookupVin(vin, { workerUrl = WORKER_URL, fetch = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (!workerUrl) throw new Error('GlobalVIN lookup is not set up');
  const url = `${workerUrl.replace(/\/+$/, '')}/v1/api/vin`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ vin }),
    signal: timeoutSignal(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { if (res.ok) throw new FormatError("GlobalVIN's answer"); }
  if (!res.ok) {
    const err = new HttpError(url, res.status, text);
    err.message = typeof data?.error === 'string' && data.error ? data.error : `POST ${url} -> HTTP ${res.status}`;
    throw err;
  }
  if (!data || typeof data !== 'object') throw new FormatError("GlobalVIN's answer");
  return data;
}

const MAX_FIELDS = 60;
const MAX_TEXT = 300;
const label = (k) => String(k).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();

// GlobalVIN's response format isn't documented to us, so the page shows its answer as a flat
// list of [label, value] pairs: nested objects become "Engine · Cylinders", arrays of plain
// values are joined, and empty values are skipped. Values are plain text; the page escapes them.
export function globalVinFields(data) {
  const out = [];
  const walk = (x, path) => {
    if (out.length >= MAX_FIELDS || x === null || x === undefined || x === '') return;
    if (Array.isArray(x)) {
      if (x.every((v) => v === null || typeof v !== 'object')) {
        const s = x.filter((v) => v !== null && v !== '').join(', ');
        if (s && path.length) out.push([path.join(' · '), s.slice(0, MAX_TEXT)]);
      } else x.forEach((v, i) => walk(v, [...path, String(i + 1)]));
      return;
    }
    if (typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) walk(v, [...path, label(k)]);
      return;
    }
    if (path.length) out.push([path.join(' · '), String(x).slice(0, MAX_TEXT)]);
  };
  walk(data, []);
  return out;
}
