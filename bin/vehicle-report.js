#!/usr/bin/env node
import { buildReport, formatReport } from '../src/report.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const vin = args.find((a) => !a.startsWith('--'));
if (!vin || flags.has('--help')) {
  console.log('usage: vehicle-report <VIN> [--json] [--force] [--no-ratings] [--no-complaints]');
  process.exit(vin ? 0 : 1);
}
const report = await buildReport(vin, {
  force: flags.has('--force'),
  include: { safetyRatings: !flags.has('--no-ratings'), complaints: !flags.has('--no-complaints') },
});
console.log(flags.has('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
process.exit(report.vinCheck.valid || flags.has('--force') ? 0 : 2);
