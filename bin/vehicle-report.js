#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildReport, formatReport } from '../src/report.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const vin = args.find((a) => !a.startsWith('--'));
if (!vin || flags.has('--help')) {
  console.log('usage: vehicle-report <VIN> [--json] [--force] [--no-ratings] [--no-complaints] [--no-history]');
  console.log('Listing history (MarketCheck, paid) runs when MARKETCHECK_API_KEY or ~/.marketcheck_key holds a key.');
  process.exit(vin ? 0 : 1);
}

// The key is never printed; MarketCheck errors are scrubbed of it (src/sources/marketcheck.js).
function marketcheckKey() {
  if (flags.has('--no-history')) return undefined;
  if (process.env.MARKETCHECK_API_KEY?.trim()) return process.env.MARKETCHECK_API_KEY.trim();
  try {
    return readFileSync(join(homedir(), '.marketcheck_key'), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

const report = await buildReport(vin, {
  force: flags.has('--force'),
  include: { safetyRatings: !flags.has('--no-ratings'), complaints: !flags.has('--no-complaints') },
  marketcheckKey: marketcheckKey(),
});
console.log(flags.has('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
process.exit(report.vinCheck.valid || flags.has('--force') ? 0 : 2);
