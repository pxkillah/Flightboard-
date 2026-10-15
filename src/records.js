// Owner-kept records for a vehicle: service, odometer readings and registrations.
// Pure functions only; storage lives with the caller. Messages and formats come in English
// or French through the lang option ('en' by default).
import { normalizeVin } from './vin.js';
import { t, fmtDistance, fmtMoney } from './i18n.js';
import { regionName } from './regions.js';

// Today's date in the device's own time zone, as YYYY-MM-DD.
export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const TYPES = {
  service: 'Service',
  mileage: 'Odometer reading',
  registration: 'Registration',
};

// Saved data: { version, vehicles: { [VIN]: { name, records[], lastViewed?, unit? } },
// lastBackupAt?, lastChangeAt? } (times in ms, so the page can say when the records aren't
// backed up; unit is the odometer unit the vehicle's owner last used). Version 1 had no
// version field and kept cost as dollars (a float); version 2 keeps costCents, an integer;
// version 3 adds readings in miles (mi) next to kilometres (km). Backups use the same numbers.
export const STORE_VERSION = 3;
export const KM_PER_MI = 1.609344;
export const MAX_ODOMETER = { km: 2_000_000, mi: 1_250_000 };
export const MAX_COST_CENTS = 100_000_000;
export const MAX_BACKUP_BYTES = 5_000_000;

const VIN_SHAPE = /^[A-HJ-NPR-Z0-9]{17}$/;
const ID_SHAPE = /^[A-Za-z0-9_-]{1,40}$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Cut by code points, so an emoji at the limit isn't split in half.
const cut = (s, n) => { const cps = Array.from(s); return cps.length > n ? cps.slice(0, n).join('') : s; };

// A real calendar date: 2025-02-30 and 2025-13-01 aren't.
export function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// An amount typed in English or French Canadian style, as "1234.56": 1,234.56 · 1 234,56 ·
// 89,99 · $45. A comma before one or two final digits is a decimal mark; other commas, spaces
// and apostrophes group thousands. Undefined when blank, null when it isn't a plain
// non-negative amount (1e5, 0x1F and -5 aren't).
function amountText(v) {
  if (v === '' || v === null || v === undefined) return undefined;
  let s = String(v).trim().replace(/^\$\s*|\s*\$$/g, '').replace(/[\s  ']/g, '');
  if (s === '') return undefined;
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

// A whole odometer reading. Stored numbers come from earlier versions and are trusted to
// round; typed text isn't.
function wholeFrom(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : NaN;
  const s = amountText(v);
  if (s === undefined) return undefined;
  return s === null ? NaN : Math.round(Number(s));
}

// Whole cents, worked out from the digits so 0.1 + 0.2 style errors can't creep in.
function centsFrom(input) {
  if (input.costCents !== undefined) {
    return Number.isSafeInteger(input.costCents) && input.costCents >= 0 ? { cents: input.costCents } : { error: 'invalid' };
  }
  const v = input.cost;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? { cents: Math.round(v * 100) } : { error: 'invalid' };
  const s = amountText(v);
  if (s === undefined) return {};
  if (s === null) return { error: 'invalid' };
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 2) return { error: 'precision' };
  return { cents: Number(whole) * 100 + Number(frac.padEnd(2, '0')) };
}

// A stable id from a record's content, so importing the same hand-written backup twice
// lands on the same records instead of adding copies. cyrb53: 53 bits, so collisions in
// one vehicle's log are vanishingly unlikely.
export function contentId(r) {
  // Miles go last, and only when present, so km records keep the ids they had before.
  const s = JSON.stringify([r.type, r.date, r.km, r.work, r.shop, r.costCents, r.province, r.plate, r.expiry, r.notes, ...(r.mi === undefined ? [] : [r.mi])]);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `c${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}
const randomId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const present = (v) => v !== undefined && v !== null && v !== '';

// The odometer reading on a record, in the unit it was read in, or null.
export function readingOf(r) {
  if (typeof r?.km === 'number') return { value: r.km, unit: 'km' };
  if (typeof r?.mi === 'number') return { value: r.mi, unit: 'mi' };
  return null;
}
export const convert = (value, from, to) => (from === to ? value : from === 'mi' ? value * KM_PER_MI : value / KM_PER_MI);
// A reading in kilometres, for comparing readings taken in different units.
export function kmOf(r) {
  const x = readingOf(r);
  return x ? convert(x.value, x.unit, 'km') : null;
}
export const fmtReading = (r, lang = 'en') => { const x = readingOf(r); return x ? fmtDistance(x.value, x.unit, lang) : ''; };

// Returns { record, errors[] }. Dates are YYYY-MM-DD strings, an odometer reading is a whole
// number stored as km or mi (the unit it was read in), and costCents is whole cents. Saved
// records carry km or mi; the form sends odometer and unit. Imports pass deterministicId so
// records without an id get one from their content. strict: false is for data this page
// already saved: it only checks the shape, so a record an older version accepted isn't
// silently lost to a newer rule.
export function makeRecord(input, { today = localDate(), deterministicId = false, strict = true, lang = 'en' } = {}) {
  const errors = [];
  const type = typeof input.type === 'string' && has(TYPES, input.type) ? input.type : null;
  if (!type) errors.push(t(lang, 'err.type'));
  const date = String(input.date ?? '').trim();
  if (!date) errors.push(t(lang, 'err.date'));
  else if (!(strict ? isRealDate(date) : DATE_SHAPE.test(date))) errors.push(t(lang, 'err.dateReal'));
  else if (date > today) errors.push(t(lang, 'err.dateFuture'));
  let unit = 'km', raw = input.km;
  if (present(input.mi)) { unit = 'mi'; raw = input.mi; }
  else if (!present(input.km)) { raw = input.odometer; if (input.unit === 'mi') unit = 'mi'; }
  const odo = wholeFrom(raw);
  if (Number.isNaN(odo)) errors.push(t(lang, 'err.odoNumber'));
  else if (strict && odo > MAX_ODOMETER[unit]) errors.push(t(lang, 'err.odoMax', { max: fmtDistance(MAX_ODOMETER[unit], unit, lang) }));
  if (type === 'mileage' && odo === undefined) errors.push(t(lang, 'err.odoMissing'));
  const cost = type === 'service' ? centsFrom(input) : {};
  if (cost.error === 'invalid') errors.push(t(lang, 'err.costInvalid'));
  else if (cost.error === 'precision') errors.push(t(lang, 'err.costPrecision'));
  else if (strict && cost.cents > MAX_COST_CENTS) errors.push(t(lang, 'err.costMax', { max: fmtMoney(MAX_COST_CENTS, lang) }));
  const expiry = type === 'registration' ? String(input.expiry ?? '').trim() : '';
  if (expiry && !(strict ? isRealDate(expiry) : DATE_SHAPE.test(expiry))) errors.push(t(lang, 'err.expiry'));
  else if (strict && expiry && expiry < date) errors.push(t(lang, 'err.expiryBefore'));
  if (errors.length) return { record: null, errors };

  const text = (v, n = 500) => cut(String(v ?? '').trim(), n).trim() || undefined;
  const record = {
    type, date,
    km: unit === 'km' ? odo : undefined,
    mi: unit === 'mi' ? odo : undefined,
    work: type === 'service' ? text(input.work) : undefined,
    shop: type === 'service' ? text(input.shop) : undefined,
    costCents: cost.cents,
    province: type === 'registration' ? text(input.province) : undefined,
    plate: type === 'registration' ? text(input.plate) : undefined,
    expiry: expiry || undefined,
    notes: text(input.notes),
  };
  for (const k of Object.keys(record)) if (record[k] === undefined) delete record[k];
  const id = typeof input.id === 'string' && ID_SHAPE.test(input.id) ? input.id : deterministicId ? contentId(record) : randomId();
  return { record: { id, ...record }, errors };
}

// Newest first; same-day entries ordered by reading.
export function sortRecords(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || (kmOf(b) ?? 0) - (kmOf(a) ?? 0));
}

// A reading converted from the other unit can come out up to a kilometre lower after
// rounding, so it takes more than that to count as lower.
const LOWER_KM = 1;

// Odometer readings that are lower than an earlier-dated reading: a sign of a typo, a
// replaced cluster, or rollback. Readings in different units are compared in km.
export function odometerIssues(records, { lang = 'en' } = {}) {
  const withKm = records.filter((r) => kmOf(r) !== null).sort((a, b) => a.date.localeCompare(b.date) || kmOf(a) - kmOf(b));
  const issues = [];
  let max = null;
  for (const r of withKm) {
    if (max && kmOf(r) < kmOf(max) - LOWER_KM && r.date > max.date) {
      issues.push({ record: r, previous: max, message: t(lang, 'odo.lower', { reading: fmtReading(r, lang), date: r.date, previous: fmtReading(max, lang), previousDate: max.date }) });
    }
    if (!max || kmOf(r) > kmOf(max)) max = r;
  }
  return issues;
}

export function summarize(records, { today = localDate(), lang = 'en' } = {}) {
  const sorted = sortRecords(records);
  const withKm = sorted.filter((r) => kmOf(r) !== null);
  const latest = withKm[0];
  const highest = withKm.reduce((m, r) => (!m || kmOf(r) > kmOf(m) ? r : m), null);
  const services = sorted.filter((r) => r.type === 'service');
  const regs = sorted.filter((r) => r.type === 'registration');
  const latestReg = regs.find((r) => r.expiry) ?? regs[0];
  let registrationStatus = null;
  if (latestReg?.expiry && isRealDate(latestReg.expiry)) {
    const days = Math.round((Date.parse(latestReg.expiry) - Date.parse(today)) / 86400000);
    registrationStatus = days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'valid';
  }
  return {
    count: records.length,
    // The most recent reading, and the highest one only when an earlier reading was higher.
    latestReading: latest ? { ...readingOf(latest), date: latest.date } : null,
    highestReading: highest && kmOf(highest) > kmOf(latest) + LOWER_KM ? { ...readingOf(highest), date: highest.date } : null,
    lastService: services[0] ?? null,
    serviceCount: services.length,
    serviceCostCents: services.reduce((s, r) => s + (r.costCents ?? 0), 0),
    latestRegistration: latestReg ?? null,
    registrationStatus,
    odometerIssues: odometerIssues(records, { lang }),
  };
}

export const fmtCents = (c, lang = 'en') => fmtMoney(c, lang);

// Plain-text history for sharing with a buyer, mechanic or insurer. Dates stay YYYY-MM-DD so
// they can't be misread in either language.
export function historyText(vin, vehicleName, records, { lang = 'en' } = {}) {
  const s = summarize(records, { lang });
  const L = [vehicleName ? t(lang, 'hist.titleNamed', { name: vehicleName, vin }) : t(lang, 'hist.title', { vin }), ''];
  const dist = (x) => fmtDistance(x.value, x.unit, lang);
  if (s.latestReading) L.push(t(lang, 'hist.latest', { reading: dist(s.latestReading), date: s.latestReading.date }));
  if (s.highestReading) L.push(t(lang, 'hist.highest', { reading: dist(s.highestReading), date: s.highestReading.date }));
  if (s.serviceCount) L.push(t(lang, 'hist.services', { n: s.serviceCount }) + (s.serviceCostCents ? t(lang, 'hist.total', { money: fmtMoney(s.serviceCostCents, lang) }) : ''));
  if (records.some((r) => typeof r.costCents === 'number')) L.push(t(lang, 'hist.cad'));
  for (const i of s.odometerIssues) L.push(t(lang, 'hist.odoCheck', { message: i.message }));
  L.push('');
  for (const r of sortRecords(records)) {
    const parts = [r.date, t(lang, `typeLong.${r.type}`)];
    if (readingOf(r)) parts.push(fmtReading(r, lang));
    if (r.work) parts.push(r.work);
    if (r.shop) parts.push(t(lang, 'hist.at', { shop: r.shop }));
    if (typeof r.costCents === 'number') parts.push(fmtMoney(r.costCents, lang));
    if (r.province || r.plate) parts.push([r.province && regionName(r.province, lang), r.plate && t(lang, 'hist.plate', { plate: r.plate })].filter(Boolean).join(', '));
    if (r.expiry) parts.push(t(lang, 'hist.expires', { date: r.expiry }));
    if (r.notes) parts.push(`(${r.notes})`);
    L.push(`- ${parts.join(' · ')}`);
  }
  L.push('', t(lang, 'hist.footer'));
  return L.join('\n');
}

// One row per record for a spreadsheet. The BOM keeps Excel from garbling accents, and a
// leading apostrophe stops a cell starting with = + - or @ from running as a formula. French
// files use semicolons and decimal commas, which French spreadsheets expect.
export function recordsCsv(records, { lang = 'en' } = {}) {
  const sep = lang === 'fr' ? ';' : ',';
  const cell = (v) => {
    let s = v === undefined || v === null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const money = (c) => { const s = (c / 100).toFixed(2); return lang === 'fr' ? s.replace('.', ',') : s; };
  const head = ['date', 'type', 'odometer', 'unit', 'work', 'shop', 'cost', 'region', 'plate', 'expires', 'notes'].map((k) => t(lang, `csv.${k}`));
  const rows = sortRecords(records).map((r) => {
    const x = readingOf(r);
    return [r.date, t(lang, `typeLong.${r.type}`), x?.value, x?.unit, r.work, r.shop,
      typeof r.costCents === 'number' ? money(r.costCents) : '', r.province && regionName(r.province, lang), r.plate, r.expiry, r.notes];
  });
  return `\uFEFF${[head, ...rows].map((row) => row.map(cell).join(sep)).join('\r\n')}\r\n`;
}

export function mergeRecords(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return [...byId.values()];
}

// Re-checks every vehicle and record. VIN keys are normalized, records that don't pass
// makeRecord are dropped and counted, and two records sharing an id keep both unless
// they're identical.
function cleanVehicles(input, { strict }) {
  const vehicles = {};
  let dropped = 0;
  for (const [key, v] of Object.entries(input && typeof input === 'object' ? input : {})) {
    const vin = normalizeVin(key);
    const list = Array.isArray(v?.records) ? v.records : [];
    if (!VIN_SHAPE.test(vin)) { dropped += list.length; continue; }
    const records = [];
    const ids = new Set();
    for (const raw of list) {
      const rec = raw && typeof raw === 'object' ? makeRecord(raw, { today: '9999-12-31', deterministicId: true, strict }).record : null;
      if (!rec) { dropped++; continue; }
      if (ids.has(rec.id)) {
        const { id, ...rest } = rec;
        rec.id = contentId(rest);
        if (ids.has(rec.id)) continue;
      }
      ids.add(rec.id);
      records.push(rec);
    }
    const prev = vehicles[vin];
    const name = typeof v?.name === 'string' ? cut(v.name.trim(), 200) : '';
    vehicles[vin] = {
      name: prev?.name || name,
      records: prev ? mergeRecords(prev.records, records) : records,
    };
    const seen = Math.max(Number(v?.lastViewed) || 0, prev?.lastViewed ?? 0);
    if (seen > 0) vehicles[vin].lastViewed = seen;
    const unit = v?.unit === 'mi' || v?.unit === 'km' ? v.unit : prev?.unit;
    if (unit) vehicles[vin].unit = unit;
  }
  return { vehicles, dropped };
}

const emptyStore = () => ({ version: STORE_VERSION, vehicles: {} });

// Turns the saved string into current-version data. problem is 'unreadable' when nothing
// can be read (the caller should keep a copy before writing over it) and 'newer' when a
// newer version of the page wrote it (the caller shouldn't write, or it would lose fields).
export function readStore(raw) {
  if (raw === null || raw === undefined || raw === '') return { data: emptyStore(), dropped: 0, problem: null };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object' || !parsed.vehicles || typeof parsed.vehicles !== 'object') {
    return { data: emptyStore(), dropped: 0, problem: 'unreadable' };
  }
  const { vehicles, dropped } = cleanVehicles(parsed.vehicles, { strict: false });
  const data = { version: STORE_VERSION, vehicles };
  for (const k of ['lastBackupAt', 'lastChangeAt']) if (Number.isFinite(parsed[k])) data[k] = parsed[k];
  return { data, dropped, problem: Number(parsed.version) > STORE_VERSION ? 'newer' : null };
}

// Keeps every vehicle that has records, and only the most recently looked-up ones of the rest.
export function pruneLookups(vehicles, keep = 50) {
  const bare = Object.entries(vehicles).filter(([, v]) => !v.records?.length)
    .sort((a, b) => (b[1].lastViewed ?? 0) - (a[1].lastViewed ?? 0));
  const out = { ...vehicles };
  for (const [vin] of bare.slice(keep)) delete out[vin];
  return out;
}

export function backupText(vehicles, savedAt = new Date().toISOString()) {
  return JSON.stringify({ app: 'vin-report', version: STORE_VERSION, savedAt, vehicles }, null, 2);
}

// Backup files: { app, version, savedAt, vehicles }. Returns { vehicles, skipped }, where
// skipped counts records that weren't valid.
export function parseBackup(text, { lang = 'en' } = {}) {
  if (String(text).length > MAX_BACKUP_BYTES) throw new Error(t(lang, 'backup.tooBig'));
  let data;
  try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch { throw new Error(t(lang, 'backup.notBackup')); }
  if (data?.app !== 'vin-report' || typeof data.vehicles !== 'object' || data.vehicles === null) throw new Error(t(lang, 'backup.notBackup'));
  if (Number(data.version) > STORE_VERSION) throw new Error(t(lang, 'backup.newer'));
  const { vehicles, dropped } = cleanVehicles(data.vehicles, { strict: true });
  return { vehicles, skipped: dropped };
}
