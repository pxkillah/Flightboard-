#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildReport, formatReport } from '../src/report.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const vin = args.find((a) => !a.startsWith('--'));
if (!vin || flags.has('--help')) {
  console.log('usage: vehicle-report <VIN> [--json] [--force] [--no-ratings] [--no-complaints] [--no-history] [--globalvin]');
  console.log('Listing history (MarketCheck, paid) runs when MARKETCHECK_API_KEY or ~/.marketcheck_key holds a key.');
  console.log('--globalvin adds GlobalVIN factory model data (paid, $2.00 a new VIN) with the key in GLOBALVIN_API_KEY or ~/.globalvin_key.');
  process.exit(vin ? 0 : 1);
}

// Keys are never printed; errors are scrubbed of them (src/sources/marketcheck.js, globalvin.js).
function key(envName, file) {
  if (process.env[envName]?.trim()) return process.env[envName].trim();
  try {
    return readFileSync(join(homedir(), file), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

// GlobalVIN bills each new VIN, so it runs only when asked for.
const globalvinKey = flags.has('--globalvin') ? key('GLOBALVIN_API_KEY', '.globalvin_key') : undefined;
if (flags.has('--globalvin') && !globalvinKey) {
  console.error('--globalvin needs a GlobalVIN API key in GLOBALVIN_API_KEY or ~/.globalvin_key.');
  process.exit(1);
}

const report = await buildReport(vin, {
  force: flags.has('--force'),
  include: { safetyRatings: !flags.has('--no-ratings'), complaints: !flags.has('--no-complaints') },
  marketcheckKey: flags.has('--no-history') ? undefined : key('MARKETCHECK_API_KEY', '.marketcheck_key'),
  globalvinKey,
});
console.log(flags.has('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
process.exit(report.vinCheck.valid || flags.has('--force') ? 0 : 2);
