// GlobalVIN VIN Decode: the factory model data GlobalVIN's catalogues hold for a VIN (engine,
// power, transmission, drive, body, seats, build date, where it was made). Its catalogues come
// from the Chinese market, so it is strongest on cars built or sold in China.
// https://www.globalvin.co/dashboard/supplier/api-docs (behind the account login)
// Paid and keyed ($2.00 a VIN; a VIN the account has decoded before is free), so it runs only on
// the command line, only when asked (--globalvin), with the user's own key. GlobalVIN refuses
// browser calls (its CORS preflight returns 403), so the page doesn't offer it. Of GlobalVIN's
// resold history reports, only Carfax is used, below.
import { getJson, FormatError } from '../http.js';

const BACKEND = 'https://globalvin.co/backend/api';

const text = (x) => (x === null || x === undefined || String(x).trim() === '' ? null : String(x).trim());
const count = (x) => {
  const n = Number.parseInt(x, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
// GlobalVIN sends each name in Chinese with an English copy beside it (Brand, Brand_en); the
// report shows only the English one.
const en = (o, k) => text(o[`${k}_en`]);
// build_date is YYYYMM.
const month = (x) => (/^\d{6}$/.test(String(x ?? '')) ? `${String(x).slice(0, 4)}-${String(x).slice(4)}` : null);

export function parseDecode(json) {
  if (json === null || json === undefined) return null;
  const what = "GlobalVIN's VIN decode";
  if (typeof json !== 'object' || typeof json.success !== 'boolean') throw new FormatError(what);
  if (!json.success) throw new Error(`GlobalVIN: ${text(json.message) ?? 'request refused'}`);
  const d = json.data;
  if (!d || typeof d !== 'object' || !Array.isArray(d.model_list ?? [])) throw new FormatError(what);
  return {
    source: 'GlobalVIN',
    vin: text(d.full_vin),
    modelYear: count(d.model_year_from_vin),
    brand: text(d.brand_en) ?? text(d.epc_cn_en),
    madeIn: text(d.made_in_en),
    buildMonth: month(d.build_date),
    exactMatch: d.matching_mode === 'exact_match',
    cached: d.fromCache === true,
    models: (d.model_list ?? []).filter((m) => m && typeof m === 'object').map((m) => ({
      description: en(m, 'Model_detail'),
      brand: en(m, 'Brand'),
      series: en(m, 'Series'),
      modelYear: count(m.Model_year),
      chassis: text(m.Chassis_code),
      engine: en(m, 'Engine_no'),
      displacement: en(m, 'Cc'),
      kw: count(m.Kw),
      hp: count(m.Hp),
      fuel: en(m, 'Fuel_type'),
      transmission: en(m, 'Transmission_detail'),
      gears: count(m.Gear_num),
      drive: en(m, 'Driving_mode'),
      body: en(m, 'Body_type'),
      doors: en(m, 'Door_num'),
      seats: count(m.Seat_num),
      emissions: en(m, 'Effluent_standard'),
      builtFrom: text(m.Date_begin),
      builtTo: text(m.Date_end),
    })),
  };
}

function hideKey(err, apiKey) {
  for (const k of ['message', 'url', 'stack', 'body']) {
    if (typeof err?.[k] === 'string') err[k] = err[k].split(apiKey).join('[key]');
  }
  return err;
}

// The key travels in a header, never the URL; errors are scrubbed of it all the same. GlobalVIN's
// refusals (bad key, no credit, service not enabled) come as JSON with a `message`, which is
// what the error says. No retries: a new VIN or report is billed.
async function call(path, apiKey, opts, request = {}) {
  try {
    return await getJson(`${BACKEND}${path}`, { ...opts, retries: 0, timeoutMs: 30000, ...request, headers: { 'x-api-key': apiKey } });
  } catch (e) {
    if (typeof e?.body === 'string') {
      try {
        const m = text(JSON.parse(e.body)?.message);
        if (m) e.message = `${e.message}: ${m}`;
      } catch { /* not JSON: keep the HTTP status */ }
    }
    throw hideKey(e, apiKey);
  }
}

export async function decode(vin, { apiKey, ...opts } = {}) {
  if (!apiKey) throw new Error('no GlobalVIN API key');
  return parseDecode(await call('/vin/lookup/decode', apiKey, opts, { method: 'POST', body: { vin } }));
}

// Carfax (via GlobalVIN's USA reports, carfax scope). The owner's own copy of a paid report for a
// North American vehicle, saved as a PDF: buildReport asks only for VINs vPIC recognizes, and the
// CLI only with --carfax. $3.00 a report. Ordering is asynchronous: the order returns a job id,
// the job is polled until it finishes, and the finished job names the report whose PDF is
// fetched. The PDF link needs no key (GlobalVIN treats the report id as the secret), so neither
// the link nor the id is shown anywhere public.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseJob(json) {
  const what = "GlobalVIN's report job";
  if (!json || typeof json !== 'object' || typeof json.success !== 'boolean') throw new FormatError(what);
  if (!json.success) throw new Error(`GlobalVIN: ${text(json.message) ?? 'request refused'}`);
  const d = json.data;
  if (!d || typeof d !== 'object' || !text(d.jobId)) throw new FormatError(what);
  const r = d.result && typeof d.result === 'object' ? d.result : {};
  return {
    jobId: text(d.jobId),
    done: d.isComplete === true || d.status === 'completed',
    failed: d.isFailed === true || d.status === 'failed' || r.success === false,
    message: text(d.statusMessage) ?? text(r.message) ?? text(d.status),
    reportId: text(r.reportId) ?? text(d.reportId),
    freeRepeat: r.freeRepeat === true || d.reused === true,
  };
}

// Orders the Carfax report and waits for it (up to maxWaitMs). Returns { reportId, pdfUrl,
// freeRepeat }. The order itself is never retried; polling is free.
export async function carfaxReport(vin, { apiKey, pollMs = 5000, maxWaitMs = 180000, ...opts } = {}) {
  if (!apiKey) throw new Error('no GlobalVIN API key');
  let job = parseJob(await call(`/usa/report/carfax/${encodeURIComponent(vin)}`, apiKey, opts));
  const until = Date.now() + maxWaitMs;
  while (!job.done && !job.failed) {
    if (Date.now() > until) throw new Error(`GlobalVIN: the Carfax report wasn't ready after ${Math.round(maxWaitMs / 1000)} s (job ${job.jobId}); it may still arrive in your GlobalVIN dashboard`);
    await wait(pollMs);
    job = parseJob(await call(`/jobs/status/${encodeURIComponent(job.jobId)}`, apiKey, opts));
  }
  if (job.failed || !job.reportId) throw new Error(`GlobalVIN: the Carfax report failed${job.message ? ` (${job.message})` : ''}`);
  return { source: 'Carfax via GlobalVIN', reportId: job.reportId, pdfUrl: `${BACKEND}/vhrs/${encodeURIComponent(job.reportId)}/pdf`, freeRepeat: job.freeRepeat };
}

// The finished report's PDF, as bytes.
export async function reportPdf(pdfUrl, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(pdfUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GlobalVIN: the report file couldn't be downloaded (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error("GlobalVIN: the report file isn't a PDF");
  return bytes;
}
