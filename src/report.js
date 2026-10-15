import { validateVin } from './vin.js';
import { decodeVin } from './sources/vpic.js';
import * as nhtsa from './sources/nhtsa.js';
import * as tc from './sources/transportCanada.js';
import { recallMismatch } from './recallMatch.js';
import { errorKind } from './http.js';

// Builds a vehicle report from public sources. Each section fails independently so
// one slow or down API doesn't sink the whole report. errors[section] holds the technical
// message and errorKinds[section] what kind of failure it was (see errorKind in http.js);
// a VIN that decodes without a make, model and year is kind 'unrecognized'.
export async function buildReport(input, { fetch, include = {}, force = false } = {}) {
  const opts = fetch ? { fetch } : {};
  const check = validateVin(input);
  const report = { vin: check.vin, vinCheck: check, generatedAt: new Date().toISOString(), errors: {}, errorKinds: {} };
  if (!check.valid && !force) return report;

  try {
    report.vehicle = await decodeVin(check.vin, opts);
  } catch (e) {
    report.errors.vehicle = e.message;
    report.errorKinds.vehicle = errorKind(e);
  }
  const v = report.vehicle;
  if (!v?.make || !v?.model || !v?.year) {
    report.errors.vehicle ??= 'decoder did not return make/model/year';
    report.errorKinds.vehicle ??= 'unrecognized';
    return report;
  }
  const ymm = { make: v.make, model: v.model, year: v.year };

  const sections = {
    recallsUS: () => nhtsa.recalls(ymm, opts),
    recallsCanada: () => tc.recalls(ymm, opts),
    complaints: () => nhtsa.complaints(ymm, opts),
    safetyRatings: () => nhtsa.safetyRatings(ymm, opts),
  };
  await Promise.all(Object.entries(sections).map(async ([name, fn]) => {
    if (include[name] === false) return;
    try {
      report[name] = await fn();
    } catch (e) {
      report.errors[name] = e.message;
      report.errorKinds[name] = errorKind(e);
    }
  }));
  for (const key of ['recallsUS', 'recallsCanada']) {
    report[key]?.forEach((r) => { r.mismatch = recallMismatch(r, v); });
  }
  return report;
}

export function formatReport(r) {
  const L = [];
  L.push(`VIN ${r.vin}`);
  if (!r.vinCheck.valid) L.push(`  ! ${r.vinCheck.errors.join('; ')}`);
  const v = r.vehicle;
  if (v) {
    L.push('', `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''} ${v.trim ?? ''}`.replace(/\s+/g, ' ').trim());
    const spec = [v.bodyClass, v.driveType, v.engineCylinders && `${v.engineCylinders} cyl`, v.displacementL && `${Number(v.displacementL).toFixed(1)}L`, v.fuelType].filter(Boolean);
    if (spec.length) L.push(`  ${spec.join(' · ')}`);
    const plant = [v.plantCity, v.plantState, v.plantCountry].filter(Boolean).join(', ');
    if (plant) L.push(`  Built: ${plant}`);
    for (const w of v.decodeWarnings ?? []) L.push(`  ! ${w}`);
  }
  const recallBlock = (title, list) => {
    if (!list) return;
    const likely = list.filter((x) => !x.mismatch?.length).length;
    L.push('', `${title}: ${likely} may apply` + (likely < list.length ? `, ${list.length - likely} probably not this vehicle` : ''));
    for (const x of [...list].sort((a, b) => (a.mismatch?.length ? 1 : 0) - (b.mismatch?.length ? 1 : 0))) {
      L.push(`  [${x.campaign}] ${x.date ?? ''} ${x.component ?? ''}`.trimEnd());
      for (const m of x.mismatch ?? []) L.push(`    (probably not this vehicle: ${m})`);
      if (x.summary) L.push(`    ${x.summary.replace(/\s+/g, ' ').slice(0, 240)}`);
      if (x.parkIt) L.push('    ** DO NOT DRIVE - park until repaired **');
    }
  };
  recallBlock('Recalls (Transport Canada)', r.recallsCanada);
  if (r.recallsCanada) L.push('  Contains information licensed under the Open Government Licence - Canada: https://open.canada.ca/en/open-government-licence-canada');
  recallBlock('Recalls (NHTSA, US)', r.recallsUS);
  if (r.complaints) {
    const c = r.complaints;
    L.push('', `Owner complaints (NHTSA): ${c.total}  crashes ${c.crashes}, fires ${c.fires}, injuries ${c.injuries}, deaths ${c.deaths}`);
    for (const t of c.topComponents.slice(0, 5)) L.push(`  ${String(t.count).padStart(4)}  ${t.component}`);
  }
  if (r.safetyRatings?.length) {
    L.push('', 'Crash ratings (NHTSA NCAP, out of 5):');
    for (const s of r.safetyRatings) L.push(`  ${s.description}: overall ${s.overall}, front ${s.frontCrash}, side ${s.sideCrash}, rollover ${s.rollover}`);
  }
  for (const [k, e] of Object.entries(r.errors)) L.push('', `(${k} unavailable: ${e})`);
  L.push('', 'Not included: accident, odometer, ownership, lien and service history. See README.');
  // API text goes straight to a terminal, so drop control characters that could retitle the
  // window, move the cursor or write the clipboard. Tabs and newlines stay.
  return L.join('\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}
