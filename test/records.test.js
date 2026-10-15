import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRecord, sortRecords, odometerIssues, summarize, historyText, parseBackup, mergeRecords } from '../src/records.js';

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
  assert.equal(record.cost, 89.99);
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
  assert.equal(s.serviceCost, 350.5);
  assert.equal(s.registrationStatus, 'expiring');
  assert.equal(summarize([mk({ type: 'registration', date: '2024-01-01', expiry: '2025-01-01' })], { today }).registrationStatus, 'expired');
});

test('history text lists everything and labels it owner-entered', () => {
  const t = historyText('1FTBR1X87LKA22229', '2020 FORD Transit', [mk({ type: 'service', date: '2026-03-01', km: 70000, work: 'Oil change', shop: 'Ford', cost: 90 })]);
  assert.match(t, /2026-03-01 · Service · 70,000 km · Oil change · at Ford · \$90\.00/);
  assert.match(t, /not independently verified/);
});

test('backup round trip ignores junk and merges by id', () => {
  const r = mk({ type: 'mileage', date: '2026-01-01', km: 5 });
  const parsed = parseBackup(JSON.stringify({ app: 'vin-report', version: 1, vehicles: {
    '1FTBR1X87LKA22229': { name: 'Van', records: [r, { type: 'bad' }] }, 'not-a-vin': { records: [r] },
  } }));
  assert.deepEqual(Object.keys(parsed), ['1FTBR1X87LKA22229']);
  assert.equal(parsed['1FTBR1X87LKA22229'].records.length, 1);
  assert.throws(() => parseBackup('{"hello":1}'), /backup/);
  assert.equal(mergeRecords([r], [{ ...r, km: 6 }])[0].km, 6);
});

test('localDate uses the device time zone, not UTC', async () => {
  const { localDate } = await import('../src/records.js');
  assert.equal(localDate(new Date(2026, 9, 15, 23, 30)), '2026-10-15');
  assert.equal(localDate(new Date(2026, 0, 5, 0, 5)), '2026-01-05');
});
