// Owner-kept records for a vehicle: service, odometer readings and registrations.
// Pure functions only; storage lives with the caller.

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

const num = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// Returns { record, errors[] }. Dates are YYYY-MM-DD strings, km and cost are numbers.
export function makeRecord(input, { today = localDate() } = {}) {
  const errors = [];
  const type = TYPES[input.type] ? input.type : null;
  if (!type) errors.push('Choose a record type.');
  const date = String(input.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Enter a date.');
  else if (date > today) errors.push("The date can't be in the future.");
  const km = num(input.km);
  if (Number.isNaN(km) || km < 0) errors.push('Kilometres must be a positive number.');
  if (type === 'mileage' && km === undefined) errors.push('Enter the odometer reading.');
  const cost = num(input.cost);
  if (Number.isNaN(cost) || cost < 0) errors.push('Cost must be a positive number.');
  const expiry = String(input.expiry ?? '').trim();
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) errors.push('Enter a valid expiry date.');
  if (errors.length) return { record: null, errors };

  const text = (v) => String(v ?? '').trim().slice(0, 500) || undefined;
  const record = {
    id: input.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    type, date, km,
    work: type === 'service' ? text(input.work) : undefined,
    shop: type === 'service' ? text(input.shop) : undefined,
    cost: type === 'service' ? cost : undefined,
    province: type === 'registration' ? text(input.province) : undefined,
    plate: type === 'registration' ? text(input.plate) : undefined,
    expiry: type === 'registration' ? expiry || undefined : undefined,
    notes: text(input.notes),
  };
  for (const k of Object.keys(record)) if (record[k] === undefined) delete record[k];
  return { record, errors };
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
  const latestKm = sorted.filter((r) => typeof r.km === 'number').sort((a, b) => b.km - a.km)[0];
  const services = sorted.filter((r) => r.type === 'service');
  const regs = sorted.filter((r) => r.type === 'registration');
  const latestReg = regs.find((r) => r.expiry) ?? regs[0];
  let registrationStatus = null;
  if (latestReg?.expiry) {
    const days = Math.round((Date.parse(latestReg.expiry) - Date.parse(today)) / 86400000);
    registrationStatus = days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'valid';
  }
  return {
    count: records.length,
    latestKm: latestKm ? { km: latestKm.km, date: latestKm.date } : null,
    lastService: services[0] ?? null,
    serviceCount: services.length,
    serviceCost: services.reduce((s, r) => s + (r.cost ?? 0), 0),
    latestRegistration: latestReg ?? null,
    registrationStatus,
    odometerIssues: odometerIssues(records),
  };
}

export const fmtKm = (km) => `${Math.round(km).toLocaleString('en-CA')} km`;
const fmtMoney = (n) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Plain-text history for sharing with a buyer, mechanic or insurer.
export function historyText(vin, vehicleName, records) {
  const s = summarize(records);
  const L = [`Owner records for ${vehicleName ? `${vehicleName} ` : ''}(VIN ${vin})`, ''];
  if (s.latestKm) L.push(`Latest odometer: ${fmtKm(s.latestKm.km)} (${s.latestKm.date})`);
  if (s.serviceCount) L.push(`Services logged: ${s.serviceCount}${s.serviceCost ? `, total ${fmtMoney(s.serviceCost)}` : ''}`);
  for (const i of s.odometerIssues) L.push(`Odometer check: ${i.message}`);
  L.push('');
  for (const r of sortRecords(records)) {
    const parts = [r.date, TYPES[r.type]];
    if (typeof r.km === 'number') parts.push(fmtKm(r.km));
    if (r.work) parts.push(r.work);
    if (r.shop) parts.push(`at ${r.shop}`);
    if (typeof r.cost === 'number') parts.push(fmtMoney(r.cost));
    if (r.province || r.plate) parts.push([r.province, r.plate && `plate ${r.plate}`].filter(Boolean).join(', '));
    if (r.expiry) parts.push(`expires ${r.expiry}`);
    if (r.notes) parts.push(`(${r.notes})`);
    L.push(`- ${parts.join(' · ')}`);
  }
  L.push('', 'Entered by the owner; not independently verified.');
  return L.join('\n');
}

// Backup files: { app, version, vehicles: { [vin]: { name, records[] } } }.
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data?.app !== 'vin-report' || typeof data.vehicles !== 'object' || data.vehicles === null) {
    throw new Error("This doesn't look like a VIN Report backup file.");
  }
  const out = {};
  for (const [vin, v] of Object.entries(data.vehicles)) {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) continue;
    const records = (Array.isArray(v?.records) ? v.records : [])
      .map((r) => makeRecord(r, { today: '9999-12-31' }).record)
      .filter(Boolean);
    out[vin] = { name: typeof v?.name === 'string' ? v.name.slice(0, 200) : '', records };
  }
  return out;
}

export function mergeRecords(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return [...byId.values()];
}
