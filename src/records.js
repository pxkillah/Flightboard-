// Owner-kept records for a vehicle: service, odometer readings and registrations.
// Pure functions only; storage lives with the caller.
import { normalizeVin } from './vin.js';

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

// Saved data: { version, vehicles: { [VIN]: { name, records[], lastViewed? } }, lastBackupAt?,
// lastChangeAt? } (both times in ms, so the page can say when the records aren't backed up).
// Version 1 had no version field and kept cost as dollars (a float); version 2 keeps
// costCents, an integer. Backup files use the same version numbers.
export const STORE_VERSION = 2;
export const MAX_KM = 2_000_000;
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

// Stored numbers come from earlier versions and are trusted to round; typed text isn't.
function kmFrom(v) {
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
  const s = JSON.stringify([r.type, r.date, r.km, r.work, r.shop, r.costCents, r.province, r.plate, r.expiry, r.notes]);
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

// Returns { record, errors[] }. Dates are YYYY-MM-DD strings, km a whole number and
// costCents whole cents. Imports pass deterministicId so records without an id get one
// from their content. strict: false is for data this page already saved: it only checks
// the shape, so a record an older version accepted isn't silently lost to a newer rule.
export function makeRecord(input, { today = localDate(), deterministicId = false, strict = true } = {}) {
  const errors = [];
  const type = typeof input.type === 'string' && has(TYPES, input.type) ? input.type : null;
  if (!type) errors.push('Choose a record type.');
  const date = String(input.date ?? '').trim();
  if (!date) errors.push('Enter a date.');
  else if (!(strict ? isRealDate(date) : DATE_SHAPE.test(date))) errors.push("That date doesn't exist.");
  else if (date > today) errors.push("The date can't be in the future.");
  const km = kmFrom(input.km);
  if (Number.isNaN(km)) errors.push('Kilometres must be a positive number.');
  else if (strict && km > MAX_KM) errors.push(`Kilometres can't be more than ${MAX_KM.toLocaleString('en-CA')}.`);
  if (type === 'mileage' && km === undefined) errors.push('Enter the odometer reading.');
  const cost = type === 'service' ? centsFrom(input) : {};
  if (cost.error === 'invalid') errors.push('Cost must be a positive amount, like 89.99.');
  else if (cost.error === 'precision') errors.push('Cost can have at most 2 decimals.');
  else if (strict && cost.cents > MAX_COST_CENTS) errors.push("Cost can't be more than $1,000,000.");
  const expiry = type === 'registration' ? String(input.expiry ?? '').trim() : '';
  if (expiry && !(strict ? isRealDate(expiry) : DATE_SHAPE.test(expiry))) errors.push('Enter a valid expiry date.');
  else if (strict && expiry && expiry < date) errors.push("The expiry date can't be before the registration date.");
  if (errors.length) return { record: null, errors };

  const text = (v, n = 500) => cut(String(v ?? '').trim(), n).trim() || undefined;
  const record = {
    type, date, km,
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

// Newest first; same-day entries ordered by km.
export function sortRecords(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || (b.km ?? 0) - (a.km ?? 0));
}

// Odometer readings that are lower than an earlier-dated reading: a sign of a
// typo, a replaced cluster, or rollback.
export function odometerIssues(records) {
  const withKm = records.filter((r) => typeof r.km === 'number').sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  const issues = [];
  let max = null;
  for (const r of withKm) {
    if (max && r.km < max.km && r.date > max.date) {
      issues.push({ record: r, previous: max, message: `${fmtKm(r.km)} on ${r.date} is lower than ${fmtKm(max.km)} on ${max.date}.` });
    }
    if (!max || r.km > max.km) max = r;
  }
  return issues;
}

export function summarize(records, { today = localDate() } = {}) {
  const sorted = sortRecords(records);
  const withKm = sorted.filter((r) => typeof r.km === 'number');
  const latest = withKm[0];
  const highest = withKm.reduce((m, r) => (!m || r.km > m.km ? r : m), null);
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
    latestKm: latest ? { km: latest.km, date: latest.date } : null,
    highestKm: highest && highest.km > latest.km ? { km: highest.km, date: highest.date } : null,
    lastService: services[0] ?? null,
    serviceCount: services.length,
    serviceCostCents: services.reduce((s, r) => s + (r.costCents ?? 0), 0),
    latestRegistration: latestReg ?? null,
    registrationStatus,
    odometerIssues: odometerIssues(records),
  };
}

export const fmtKm = (km) => `${Math.round(km).toLocaleString('en-CA')} km`;
export const fmtCents = (c) => `$${(c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Plain-text history for sharing with a buyer, mechanic or insurer.
export function historyText(vin, vehicleName, records) {
  const s = summarize(records);
  const L = [`Owner records for ${vehicleName ? `${vehicleName} ` : ''}(VIN ${vin})`, ''];
  if (s.latestKm) L.push(`Latest odometer reading: ${fmtKm(s.latestKm.km)} (${s.latestKm.date})`);
  if (s.highestKm) L.push(`Highest reading: ${fmtKm(s.highestKm.km)} (${s.highestKm.date})`);
  if (s.serviceCount) L.push(`Services logged: ${s.serviceCount}${s.serviceCostCents ? `, total ${fmtCents(s.serviceCostCents)}` : ''}`);
  if (records.some((r) => typeof r.costCents === 'number')) L.push('Costs are in Canadian dollars.');
  for (const i of s.odometerIssues) L.push(`Odometer check: ${i.message}`);
  L.push('');
  for (const r of sortRecords(records)) {
    const parts = [r.date, TYPES[r.type]];
    if (typeof r.km === 'number') parts.push(fmtKm(r.km));
    if (r.work) parts.push(r.work);
    if (r.shop) parts.push(`at ${r.shop}`);
    if (typeof r.costCents === 'number') parts.push(fmtCents(r.costCents));
    if (r.province || r.plate) parts.push([r.province, r.plate && `plate ${r.plate}`].filter(Boolean).join(', '));
    if (r.expiry) parts.push(`expires ${r.expiry}`);
    if (r.notes) parts.push(`(${r.notes})`);
    L.push(`- ${parts.join(' · ')}`);
  }
  L.push('', 'Entered by the owner; not independently verified.');
  return L.join('\n');
}

// One row per record for a spreadsheet. The BOM keeps Excel from garbling accents, and a
// leading apostrophe stops a cell starting with = + - or @ from running as a formula.
export function recordsCsv(records) {
  const cell = (v) => {
    let s = v === undefined || v === null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Date', 'Type', 'Odometer (km)', 'Work', 'Shop', 'Cost (CAD)', 'Province', 'Plate', 'Expires', 'Notes'];
  const rows = sortRecords(records).map((r) => [r.date, TYPES[r.type], r.km, r.work, r.shop,
    typeof r.costCents === 'number' ? (r.costCents / 100).toFixed(2) : '', r.province, r.plate, r.expiry, r.notes]);
  return `﻿${[head, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
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

const NOT_A_BACKUP = "This isn't a VIN Report backup. Choose the .json file made by Save backup.";

// Backup files: { app, version, savedAt, vehicles }. Returns { vehicles, skipped }, where
// skipped counts records that weren't valid.
export function parseBackup(text) {
  if (String(text).length > MAX_BACKUP_BYTES) throw new Error('That file is too big to be a VIN Report backup.');
  let data;
  try { data = JSON.parse(String(text).replace(/^﻿/, '')); } catch { throw new Error(NOT_A_BACKUP); }
  if (data?.app !== 'vin-report' || typeof data.vehicles !== 'object' || data.vehicles === null) throw new Error(NOT_A_BACKUP);
  if (Number(data.version) > STORE_VERSION) throw new Error('This backup is from a newer version of VIN Report. Reload the page, then try again.');
  const { vehicles, dropped } = cleanVehicles(data.vehicles, { strict: true });
  return { vehicles, skipped: dropped };
}
