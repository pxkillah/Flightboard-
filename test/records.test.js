import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRecord, sortRecords, odometerIssues, summarize, historyText, parseBackup, mergeRecords, readStore, pruneLookups, recordsCsv, backupText, fmtCents, MAX_BACKUP_BYTES } from '../src/records.js';

const today = '2026-10-15';
const mk = (o) => makeRecord(o, { today }).record;

test('validates required fields per type', () => {
  assert.match(makeRecord({ type: 'mileage', date: '2026-01-01' }, { today }).errors.join(), /odometer/);
  assert.match(makeRecord({ type: 'service', date: '2027-01-01' }, { today }).errors.join(), /future/);
  assert.match(makeRecord({ type: 'service', date: '2026-01-01', km: '-5' }, { today }).errors.join(), /positive/);
  assert.match(makeRecord({ type: 'nope', date: '2026-01-01' }, { today }).errors.join(), /type/);
  const { record, errors } = makeRecord({ type: 'service', date: '2026-01-01', km: '45,200', cost: '89.99', work: ' Oil change ', province: 'ON' }, { today });
  assert.deepEqual(errors, []);
  assert.equal(record.km, 45200);
  assert.equal(record.costCents, 8999);
  assert.equal(record.work, 'Oil change');
  assert.equal(record.province, undefined, 'fields from other types are dropped');
});

test('sorts newest first', () => {
  const rs = [mk({ type: 'mileage', date: '2025-01-01', km: 1 }), mk({ type: 'mileage', date: '2026-01-01', km: 2 })];
  assert.equal(sortRecords(rs)[0].date, '2026-01-01');
});

test('flags odometer going backwards', () => {
  const rs = [
    mk({ type: 'mileage', date: '2024-05-01', km: 60000 }),
    mk({ type: 'service', date: '2025-05-01', km: 52000, work: 'Brakes' }),
    mk({ type: 'mileage', date: '2026-05-01', km: 75000 }),
  ];
  const issues = odometerIssues(rs);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /52,000 km on 2025-05-01 is lower than 60,000 km on 2024-05-01/);
  assert.deepEqual(odometerIssues([rs[0], rs[2]]), []);
});

test('summary and registration status', () => {
  const rs = [
    mk({ type: 'service', date: '2026-03-01', km: 70000, cost: 100 }),
    mk({ type: 'service', date: '2026-06-01', km: 74000, cost: 250.5 }),
    mk({ type: 'registration', date: '2025-11-01', province: 'ON', expiry: '2026-11-01' }),
  ];
  const s = summarize(rs, { today });
  assert.equal(s.latestKm.km, 74000);
  assert.equal(s.serviceCount, 2);
  assert.equal(s.serviceCostCents, 35050);
  assert.equal(s.registrationStatus, 'expiring');
  assert.equal(summarize([mk({ type: 'registration', date: '2024-01-01', expiry: '2025-01-01' })], { today }).registrationStatus, 'expired');
});

test('history text lists everything and labels it owner-entered', () => {
  const t = historyText('1FTBR1X87LKA22229', '2020 FORD Transit', [mk({ type: 'service', date: '2026-03-01', km: 70000, work: 'Oil change', shop: 'Ford', cost: 90 })]);
  assert.match(t, /2026-03-01 · Service · 70,000 km · Oil change · at Ford · \$90\.00/);
  assert.match(t, /not independently verified/);
  assert.match(t, /Costs are in Canadian dollars\./);
});

test('backup round trip ignores junk and merges by id', () => {
  const r = mk({ type: 'mileage', date: '2026-01-01', km: 5 });
  const parsed = parseBackup(JSON.stringify({ app: 'vin-report', version: 1, vehicles: {
    '1FTBR1X87LKA22229': { name: 'Van', records: [r, { type: 'bad' }] }, 'not-a-vin': { records: [r] },
  } }));
  assert.deepEqual(Object.keys(parsed.vehicles), ['1FTBR1X87LKA22229']);
  assert.equal(parsed.vehicles['1FTBR1X87LKA22229'].records.length, 1);
  assert.equal(parsed.skipped, 2, 'the bad record and the one under a non-VIN key');
  assert.throws(() => parseBackup('{"hello":1}'), /backup/);
  assert.equal(mergeRecords([r], [{ ...r, km: 6 }])[0].km, 6);
});

test('localDate uses the device time zone, not UTC', async () => {
  const { localDate } = await import('../src/records.js');
  assert.equal(localDate(new Date(2026, 9, 15, 23, 30)), '2026-10-15');
  assert.equal(localDate(new Date(2026, 0, 5, 0, 5)), '2026-01-05');
});

const err = (o) => makeRecord(o, { today }).errors.join(' ');

test('dates must exist, and registrations expire after they start', () => {
  for (const date of ['2025-02-30', '2025-13-45', '0000-00-00', '2025-2-3']) assert.match(err({ type: 'service', date }), /doesn't exist/, date);
  assert.equal(err({ type: 'service', date: '2024-02-29' }), '', 'leap day');
  assert.match(err({ type: 'registration', date: '2025-01-01', expiry: '2025-13-40' }), /expiry/);
  assert.match(err({ type: 'registration', date: '2025-06-01', expiry: '2025-05-01' }), /before the registration/);
});

test('only plain amounts are accepted for km and cost', () => {
  for (const km of ['1e5', '0x1F', '-5', '12abc']) assert.match(err({ type: 'mileage', date: '2026-01-01', km }), /positive number/, km);
  assert.match(err({ type: 'mileage', date: '2026-01-01', km: 1e20 }), /more than 2,000,000/);
  assert.equal(mk({ type: 'mileage', date: '2026-01-01', km: '45 200' }).km, 45200);
  for (const cost of ['0x10', 'abc', '-1']) assert.match(err({ type: 'service', date: '2026-01-01', cost }), /positive amount/, cost);
  assert.match(err({ type: 'service', date: '2026-01-01', cost: '19.995' }), /2 decimals/);
  assert.match(err({ type: 'service', date: '2026-01-01', cost: '2000000' }), /more than \$1,000,000/);
});

test('costs are whole cents, typed in English or French style', () => {
  const cents = (cost) => mk({ type: 'service', date: '2026-01-01', cost }).costCents;
  assert.equal(cents('89.99'), 8999);
  assert.equal(cents('89,99'), 8999, 'French decimal comma');
  assert.equal(cents('1 234,56'), 123456);
  assert.equal(cents('1,234.56'), 123456);
  assert.equal(cents('1,234'), 123400, 'a comma before 3 digits groups thousands');
  assert.equal(cents('$45'), 4500);
  const dimes = ['0.10', '0.10', '0.10'].map((cost) => mk({ type: 'service', date: '2026-01-01', cost }));
  assert.equal(fmtCents(summarize(dimes, { today }).serviceCostCents), '$0.30', 'no 0.30000000000000004');
});

test('only own record types count', () => {
  assert.match(err({ type: 'constructor', date: '2026-01-01' }), /type/);
  assert.match(err({ type: '__proto__', date: '2026-01-01' }), /type/);
});

test('long text is cut without splitting an emoji', () => {
  const notes = mk({ type: 'service', date: '2026-01-01', notes: `${'a'.repeat(499)}🚗🚗` }).notes;
  assert.equal(Array.from(notes).length, 500);
  assert.ok(notes.endsWith('🚗'));
  assert.ok(notes.isWellFormed?.() ?? true);
});

test('the latest reading is the newest, and a higher earlier one is shown too', () => {
  const s = summarize([mk({ type: 'mileage', date: '2024-01-01', km: 150000 }), mk({ type: 'mileage', date: '2026-01-01', km: 76000 })], { today });
  assert.deepEqual(s.latestKm, { km: 76000, date: '2026-01-01' });
  assert.deepEqual(s.highestKm, { km: 150000, date: '2024-01-01' });
  assert.match(historyText('1FTBR1X87LKA22229', '', [mk({ type: 'mileage', date: '2026-01-01', km: 5 })]), /Latest odometer reading: 5 km/);
});

test('imports: ids, duplicates and re-imports', () => {
  const file = (records) => JSON.stringify({ app: 'vin-report', version: 2, vehicles: { '1FTBR1X87LKA22229': { name: 'Van', records } } });
  const idless = [{ type: 'mileage', date: '2025-01-01', km: 10 }, { type: 'mileage', date: '2025-02-01', km: 20 }];
  let have = [];
  for (let i = 0; i < 3; i++) have = mergeRecords(have, parseBackup(file(idless)).vehicles['1FTBR1X87LKA22229'].records);
  assert.equal(have.length, 2, 'restoring the same id-less file again adds nothing');

  const numericId = parseBackup(file([{ id: 7, type: 'mileage', date: '2025-01-01', km: 10 }])).vehicles['1FTBR1X87LKA22229'].records[0];
  assert.equal(typeof numericId.id, 'string');

  const shared = parseBackup(file([{ id: 'x', type: 'mileage', date: '2025-01-01', km: 10 }, { id: 'x', type: 'mileage', date: '2025-02-01', km: 20 }]));
  assert.equal(shared.vehicles['1FTBR1X87LKA22229'].records.length, 2, 'two different records sharing an id are both kept');
});

test('imports: VIN keys, skipped rows and readable errors', () => {
  const r = { type: 'mileage', date: '2025-01-01', km: 10 };
  const lower = parseBackup(JSON.stringify({ app: 'vin-report', version: 1, vehicles: { '1ftbr1x87lka22229': { records: [r] } } }));
  assert.deepEqual(Object.keys(lower.vehicles), ['1FTBR1X87LKA22229']);
  const mixed = parseBackup(JSON.stringify({ app: 'vin-report', vehicles: { '1FTBR1X87LKA22229': { records: [r, { type: 'service', date: '2025-02-30' }, { type: 'nope' }] } } }));
  assert.equal(mixed.skipped, 2);
  assert.equal(parseBackup(`﻿${JSON.stringify({ app: 'vin-report', vehicles: {} })}`).skipped, 0, 'a BOM is fine');
  assert.throws(() => parseBackup('date,type\n2025-01-01,service'), /isn't a VIN Report backup/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'vin-report', version: 99, vehicles: {} })), /newer version/);
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /too big/);
});

test('saved data upgrades from version 1 and keeps what an older page accepted', () => {
  const v1 = JSON.stringify({ vehicles: { '1FTBR1X87LKA22229': { name: 'Van', lastViewed: 5, records: [
    { id: 'a', type: 'service', date: '2025-01-01', cost: 19.99 },
    { id: 'b', type: 'registration', date: '2025-01-01', expiry: '2025-13-40' },
    { id: 'c', type: 'mileage', km: 5 },
  ] } } });
  const { data, dropped, problem } = readStore(v1);
  const recs = data.vehicles['1FTBR1X87LKA22229'].records;
  assert.equal(problem, null);
  assert.equal(data.version, 2);
  assert.equal(recs.find((x) => x.id === 'a').costCents, 1999);
  assert.ok(recs.find((x) => x.id === 'b'), 'an odd date saved by an older version is kept');
  assert.equal(summarize(recs, { today }).registrationStatus, null, 'and never reported as a valid registration');
  assert.equal(dropped, 1, 'the record with no date is left out');
  assert.equal(data.vehicles['1FTBR1X87LKA22229'].lastViewed, 5);
});

test('unreadable and newer saved data are reported, not silently replaced', () => {
  assert.equal(readStore('{"vehicles":{"1FTBR1X8').problem, 'unreadable');
  assert.equal(readStore('[]').problem, 'unreadable');
  assert.equal(readStore(null).problem, null);
  assert.equal(readStore(JSON.stringify({ version: 3, vehicles: {} })).problem, 'newer');
});

test('a backup file restores what it saved', () => {
  const r = mk({ type: 'service', date: '2026-01-01', cost: '12.34', work: 'Oil' });
  const back = parseBackup(backupText({ '1FTBR1X87LKA22229': { name: 'Van', records: [r] } }));
  assert.deepEqual(back.vehicles['1FTBR1X87LKA22229'].records, [r]);
  assert.equal(back.skipped, 0);
});

test('old lookups are pruned, vehicles with records never are', () => {
  const vehicles = { KEEP: { name: 'A', records: [{ id: 'r' }], lastViewed: 1 } };
  for (let i = 0; i < 60; i++) vehicles[`V${i}`] = { name: '', records: [], lastViewed: i };
  const out = pruneLookups(vehicles, 50);
  assert.ok(out.KEEP);
  assert.equal(Object.keys(out).length, 51);
  assert.ok(out.V59 && !out.V9, 'the newest lookups stay');
});

test('CSV export quotes, guards formulas and keeps accents', () => {
  const csv = recordsCsv([mk({ type: 'service', date: '2026-01-01', km: 1000, work: '=HYPERLINK("x")', shop: 'Garage Côté, Inc.', cost: '12.5', notes: 'line one\nline two' })]);
  assert.ok(csv.startsWith('﻿Date,Type,Odometer (km)'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"Garage Côté, Inc\."/);
  assert.match(csv, /,12\.50,/);
  assert.match(csv, /"line one\nline two"\r\n$/);
});
