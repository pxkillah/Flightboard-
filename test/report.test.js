// Offline tests: fetch is stubbed with minimal payloads in the documented response
// shapes. These check parsing and wiring, not live API behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, formatReport } from '../src/report.js';
import { rowsToObjects, parseRecalls as parseTc } from '../src/sources/transportCanada.js';
import { parseDecode } from '../src/sources/vpic.js';

const VIN = '1HGCM82633A004352';
const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

function stubFetch(routes) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    for (const [re, res] of routes) if (re.test(url)) return typeof res === 'function' ? res(url) : res;
    return json({}, 404);
  };
  return { fetch, calls };
}

const vpic = json({ Results: [{ Make: 'HONDA', Model: 'Accord', ModelYear: '2003', Trim: 'EX-V6', BodyClass: 'Coupe', EngineCylinders: '6', DisplacementL: '2.998832', PlantCountry: 'UNITED STATES (USA)', ErrorCode: '0', ErrorText: '0 - VIN decoded clean.' }] });
const tcRow = (n, date, sys) => [
  { Name: 'Recall number', Value: { Literal: n } },
  { Name: 'Recall date', Value: { Literal: date } },
  { Name: 'System type', Value: { Literal: sys } },
];

const routes = [
  [/vpic\.nhtsa\.dot\.gov/, vpic],
  [/recallsByVehicle/, json({ results: [{ NHTSACampaignNumber: '03V123000', ReportReceivedDate: '01/02/2003', Component: 'AIR BAGS', Summary: 'Inflator may rupture.', parkIt: true }] })],
  [/complaintsByVehicle/, json({ results: [
    { components: 'AIR BAGS,ELECTRICAL SYSTEM', crash: true, numberOfInjuries: 1 },
    { components: 'AIR BAGS', fire: true },
  ] })],
  [/SafetyRatings\/modelyear/, json({ Results: [{ VehicleId: 42 }] })],
  [/SafetyRatings\/VehicleId\/42/, json({ Results: [{ VehicleDescription: '2003 Honda Accord 2DR', OverallRating: '4' }] })],
  [/year-range\/2003-2003/, json({ ResultSet: [tcRow('2003001', '2003-01-15', 'Air bags'), tcRow('2003001', '2003-01-15', 'Air bags')] })],
  [/recall-summary\/recall-number\/2003001/, json({ ResultSet: [[{ Name: 'Comment', Value: { Literal: 'Driver airbag inflator.' } }]] })],
];

test('builds a full report from all sources', async () => {
  const { fetch, calls } = stubFetch(routes);
  const r = await buildReport(VIN, { fetch });
  assert.deepEqual(r.errors, {});
  assert.equal(r.vehicle.make, 'HONDA');
  assert.equal(r.vehicle.year, 2003);
  assert.equal(r.recallsUS[0].parkIt, true);
  assert.equal(r.recallsCanada.length, 1, 'duplicate TC rows collapse');
  assert.equal(r.recallsCanada[0].summary, 'Driver airbag inflator.');
  assert.equal(r.complaints.total, 2);
  assert.deepEqual(r.complaints.topComponents[0], { component: 'AIR BAGS', count: 2 });
  assert.equal(r.safetyRatings[0].overall, '4');
  assert.ok(calls.some((u) => u.includes('make-name/honda/model-name/accord')));
  const text = formatReport(r);
  assert.match(text, /2003 HONDA Accord EX-V6/);
  assert.match(text, /DO NOT DRIVE/);
});

test('one failing source does not sink the report', async () => {
  const { fetch } = stubFetch([[/complaintsByVehicle/, json({}, 400)], ...routes]);
  const r = await buildReport(VIN, { fetch });
  assert.match(r.errors.complaints, /HTTP 400/);
  assert.equal(r.recallsUS.length, 1);
});

test('invalid VIN stops before any network call unless forced', async () => {
  const { fetch, calls } = stubFetch(routes);
  const r = await buildReport('1HGCM82643A004352', { fetch });
  assert.equal(r.vinCheck.valid, false);
  assert.equal(calls.length, 0);
});

test('vPIC decode warnings surface', () => {
  const v = parseDecode({ Results: [{ Make: 'X', ErrorCode: '1,11', ErrorText: '1 - Check Digit incorrect; 11 - Incorrect Model Year' }] });
  assert.equal(v.decodeWarnings.length, 2);
});

test('TC parser tolerates missing values', () => {
  assert.deepEqual(rowsToObjects({ ResultSet: [[{ Name: 'Recall number', Value: null }]] }), [{ 'Recall number': null }]);
  assert.deepEqual(parseTc(null), []);
});
