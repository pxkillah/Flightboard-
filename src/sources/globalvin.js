// GlobalVIN VIN Decode: the factory model data GlobalVIN's catalogues hold for a VIN (engine,
// power, transmission, drive, body, seats, build date, where it was made). Its catalogues come
// from the Chinese market, so it is strongest on cars built or sold in China.
// https://www.globalvin.co/dashboard/supplier/api-docs (behind the account login)
// Paid and keyed ($2.00 a VIN; a VIN the account has decoded before is free), so it runs only on
// the command line, only when asked (--globalvin), with the user's own key. GlobalVIN refuses
// browser calls (its CORS preflight returns 403), so the page doesn't offer it. GlobalVIN also
// resells Carfax and AutoCheck reports; this module calls only VIN Decode (README: Scope).
import { getJson, FormatError } from '../http.js';

const URL_DECODE = 'https://globalvin.co/backend/api/vin/lookup/decode';

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
// what the error says. No retries: each new VIN is billed.
export async function decode(vin, { apiKey, ...opts } = {}) {
  if (!apiKey) throw new Error('no GlobalVIN API key');
  try {
    return parseDecode(await getJson(URL_DECODE, { ...opts, retries: 0, timeoutMs: 30000, method: 'POST', headers: { 'x-api-key': apiKey }, body: { vin } }));
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
