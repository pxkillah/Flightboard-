#!/usr/bin/env node
// Builds a real report for NHTSA's sample VIN (a 2003 Honda Accord) and checks every
// section came back in the expected format. Run daily by .github/workflows/live-check.yml,
// so an NHTSA outage or format change shows up as a failed run, not as wrong reports.
import { buildReport } from '../src/report.js';

const VIN = '1HGCM82633A004352';
const r = await buildReport(VIN);
const problems = [];
const warnings = [];

const v = r.vehicle;
if (r.errors.vehicle) {
  // Without a decoded vehicle no other section runs, so there's nothing more to check.
  console.log(`::error::VIN decoder: ${r.errorKinds.vehicle}: ${r.errors.vehicle}`);
  process.exit(1);
}
if (v.make !== 'HONDA' || !/accord/i.test(v.model) || v.year !== 2003) problems.push(`VIN decoder: expected a 2003 Honda Accord, got ${v.year} ${v.make} ${v.model}`);

for (const [section, label] of [['recallsUS', 'Recalls'], ['complaints', 'Complaints'], ['safetyRatings', 'Crash ratings']]) {
  if (r.errors[section]) problems.push(`${label}: ${r.errorKinds[section]}: ${r.errors[section]}`);
}
// This model has many recalls and complaints on file, so none means the data went missing.
if (!r.errors.recallsUS && !(r.recallsUS?.length > 0 && r.recallsUS.every((x) => x.campaign && x.date))) problems.push('Recalls: none found, or missing campaign numbers or dates');
if (!r.errors.complaints && !(r.complaints?.total > 0)) problems.push('Complaints: none found');
// The web page doesn't use Transport Canada, so its problems only warn.
if (r.errors.recallsCanada) warnings.push(`Transport Canada recalls (CLI only): ${r.errorKinds.recallsCanada}: ${r.errors.recallsCanada}`);

for (const w of warnings) console.log(`::warning::${w}`);
if (problems.length) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}
console.log(`OK: ${v.year} ${v.make} ${v.model}, ${r.recallsUS.length} recalls, ${r.complaints.total} complaints, ${r.safetyRatings.length} rated versions.`);
