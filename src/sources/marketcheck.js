// MarketCheck History by VIN: the online sale listings MarketCheck has recorded for a VIN, each
// with dates, seller, asking price and advertised mileage. US dealer sites since 2015, Canadian
// dealer sites since 2018 and Canadian private sellers since 2023; no classified sites.
// https://docs.marketcheck.com/docs/api/cars/vehicle-history/history-by-vin
// Paid and keyed ($0.006 a call on a paid plan), so it's called only with the user's own key:
// by the CLI when one is set, and by the page when the visitor has saved one on their device
// and asks (decision 13). The key goes in the query string, so errors are scrubbed of it.
import { getJson, HttpError, FormatError } from '../http.js';
import { isoDate } from '../dates.js';
import { PROVINCES } from '../regions.js';

const BASE = 'https://api.marketcheck.com/v2/history/car';
const PAGE_SIZE = 50;
const KM_PER_MI = 1.609344;
// Advertised readings are rounded and sometimes mistyped; only a clear drop is flagged.
const LOWER_KM = 1000;
// The same seller listing the car again within this long is one stay on the market.
const RELIST_DAYS = 180;

const positive = (x) => {
  const n = Number(x);
  return x !== null && x !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

// MarketCheck's field is called `miles` for every listing, but Canadian dealers advertise km and
// the docs don't say it's converted, so a listing in a province is read as km and CAD.
export function parseHistory(json) {
  if (json === null || json === undefined) return [];
  const what = "MarketCheck's listing history";
  if (!Array.isArray(json)) throw new FormatError(what);
  if (json.length && !json.some((x) => x && typeof x === 'object' && 'first_seen_at_date' in x)) throw new FormatError(what);
  return json.filter((x) => x && typeof x === 'object').map((x) => {
    const region = x.state ? String(x.state).toUpperCase() : null;
    const canada = region !== null && Object.hasOwn(PROVINCES, region);
    const reading = positive(x.miles);
    return {
      id: x.id ?? null,
      firstSeen: isoDate(x.first_seen_at_date),
      lastSeen: isoDate(x.last_seen_at_date),
      price: positive(x.price),
      currency: canada ? 'CAD' : 'USD',
      odometer: reading === null ? null : { value: reading, unit: canada ? 'km' : 'mi' },
      condition: x.inventory_type ?? null,
      sellerType: x.seller_type ?? null,
      seller: x.seller_name ?? null,
      city: x.city ?? null,
      region,
      website: x.source ?? null,
    };
  });
}

const byFirstSeen = (a, b) => String(a.firstSeen ?? '').localeCompare(String(b.firstSeen ?? ''));
const days = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;
export const kmOf = (o) => (o.unit === 'mi' ? o.value * KM_PER_MI : o.value);

// Groups the listings into stays on the market (one seller, new or used, relisted within
// RELIST_DAYS) and flags advertised readings lower than an earlier one.
export function summarizeHistory(input) {
  const listings = [...input].sort(byFirstSeen);
  const stints = [];
  for (const l of listings) {
    const key = [l.seller, l.condition, l.region].join('|');
    const s = stints.find((x) => x.key === key && !(days(x.to, l.firstSeen) > RELIST_DAYS));
    if (!s) {
      stints.push({ key, seller: l.seller, city: l.city, region: l.region, condition: l.condition, sellerType: l.sellerType,
        currency: l.currency, from: l.firstSeen, to: l.lastSeen ?? l.firstSeen, listings: 1,
        firstPrice: l.price, lastPrice: l.price, odometer: l.odometer });
      continue;
    }
    s.listings++;
    if ((l.lastSeen ?? '') > (s.to ?? '')) s.to = l.lastSeen;
    if (l.price !== null) { s.firstPrice ??= l.price; s.lastPrice = l.price; }
    if (l.odometer && (!s.odometer || kmOf(l.odometer) > kmOf(s.odometer))) s.odometer = l.odometer;
  }
  const odometerIssues = [];
  let highest = null;
  for (const l of listings.filter((x) => x.odometer)) {
    if (highest && kmOf(l.odometer) < kmOf(highest.odometer) - LOWER_KM) odometerIssues.push({ listing: l, previous: highest });
    if (!highest || kmOf(l.odometer) > kmOf(highest.odometer)) highest = l;
  }
  return {
    source: 'MarketCheck',
    listings,
    stints: stints.map(({ key, ...s }) => s),
    odometerIssues,
  };
}

const at = (date, o) => ({ date, value: o.value, unit: o.unit });

// What the web page keeps of a history: small enough to save per VIN in the browser, so seeing
// it again costs no calls. Readings are the advertised odometer of each listing, oldest first.
export function historyView(summary) {
  const listings = summary?.listings ?? [];
  const dates = listings.flatMap((l) => [l.firstSeen, l.lastSeen]).filter(Boolean).sort();
  return {
    count: listings.length,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    stints: summary?.stints ?? [],
    readings: listings.filter((l) => l.odometer && l.firstSeen).map((l) => at(l.firstSeen, l.odometer))
      .sort((a, b) => a.date.localeCompare(b.date)),
    issues: (summary?.odometerIssues ?? []).map(({ listing, previous }) => ({
      reading: at(listing.firstSeen, listing.odometer), previous: at(previous.firstSeen, previous.odometer),
    })),
  };
}

const isUnit = (u) => u === 'km' || u === 'mi';
const isReading = (r) => Boolean(r && typeof r.date === 'string' && Number.isFinite(r.value) && isUnit(r.unit));
const isText = (x) => x === null || x === undefined || typeof x === 'string';
const isPrice = (x) => x === null || (Number.isFinite(x) && x > 0);
const isStint = (s) => Boolean(s && typeof s === 'object' && Number.isInteger(s.listings) && s.listings > 0
  && (s.currency === 'CAD' || s.currency === 'USD') && isPrice(s.firstPrice) && isPrice(s.lastPrice)
  && (s.odometer === null || (s.odometer && Number.isFinite(s.odometer.value) && isUnit(s.odometer.unit)))
  && ['seller', 'city', 'region', 'condition', 'sellerType', 'from', 'to'].every((k) => isText(s[k])));

// A saved view comes back from browser storage, which anything on the device can change, so
// the page checks its shape before drawing it and asks MarketCheck again if it's wrong.
export function isHistoryView(v) {
  return Boolean(v && typeof v === 'object' && Number.isInteger(v.count) && v.count >= 0 && isText(v.from) && isText(v.to)
    && Array.isArray(v.stints) && v.stints.every(isStint)
    && Array.isArray(v.readings) && v.readings.every(isReading)
    && Array.isArray(v.issues) && v.issues.every((i) => i && isReading(i.reading) && isReading(i.previous)));
}

// Checks the owner's latest reading (from My records) against the advertised ones: a reading
// lower than an earlier ad, or an ad lower than an earlier reading, is a contradiction.
// Returns null when there's nothing to compare, else { ok, ad }: the contradicting ad, or the
// latest one when they agree.
export function compareWithAds(view, own) {
  const ads = view?.readings ?? [];
  if (!isReading(own) || !ads.length) return null;
  const mine = kmOf(own);
  for (const ad of ads) {
    const theirs = kmOf(ad);
    if (ad.date <= own.date ? mine < theirs - LOWER_KM : theirs < mine - LOWER_KM) return { ok: false, ad };
  }
  return { ok: true, ad: ads.at(-1) };
}

function hideKey(err, apiKey) {
  for (const secret of new Set([apiKey, encodeURIComponent(apiKey)])) {
    for (const k of ['message', 'url', 'stack']) {
      if (typeof err?.[k] === 'string') err[k] = err[k].split(secret).join('[key]');
    }
  }
  return err;
}

// Pages through the history 50 listings at a time; each page is a billed call, so it stops
// after maxPages. A 422 means the page is past the last listing.
export async function history(vin, { apiKey, maxPages = 4, ...opts } = {}) {
  if (!apiKey) throw new Error('no MarketCheck API key');
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${BASE}/${encodeURIComponent(vin)}?${new URLSearchParams({ api_key: apiKey, page, sort_order: 'asc' })}`;
    let json;
    try {
      json = await getJson(url, opts);
    } catch (e) {
      if (page > 1 && e instanceof HttpError && e.status === 422) break;
      throw hideKey(e, apiKey);
    }
    out.push(...parseHistory(json));
    if (!Array.isArray(json) || json.length < PAGE_SIZE) break;
  }
  return out;
}
