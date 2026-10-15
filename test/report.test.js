// Offline tests: fetch is stubbed with minimal payloads in the documented response
// shapes. These check parsing and wiring, not live API behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, formatReport } from '../src/report.js';
import { rowsToObjects, parseRecalls as parseTc } from '../src/sources/transportCanada.js';
import { parseDecode } from '../src/sources/vpic.js';
import { parseComplaints, parseRecalls } from '../src/sources/nhtsa.js';

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
  assert.match(text, /Open Government Licence - Canada/, 'Transport Canada data carries its licence attribution');
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

test('complaint components keep names that contain a comma', () => {
  const c = parseComplaints({ results: [{ components: 'SERVICE BRAKES, HYDRAULIC,ENGINE' }, { components: 'SERVICE BRAKES, HYDRAULIC' }] });
  assert.deepEqual(c.topComponents, [{ component: 'SERVICE BRAKES, HYDRAULIC', count: 2 }, { component: 'ENGINE', count: 1 }]);
});

test('TC parser tolerates missing values', () => {
  assert.deepEqual(rowsToObjects({ ResultSet: [[{ Name: 'Recall number', Value: null }]] }), [{ 'Recall number': null }]);
  assert.deepEqual(parseTc(null), []);
});

test('a changed NHTSA format is an error, never "no recalls"', async () => {
  // NHTSA renames its list: the report must not claim there are no recalls or complaints.
  const { fetch } = stubFetch([
    [/recallsByVehicle/, json({ Count: 3, Results: [{ campaign: 'X' }, { campaign: 'Y' }, { campaign: 'Z' }] })],
    [/complaintsByVehicle/, json({ count: 2, results: [{ parts: 'AIR BAGS' }, { parts: 'ENGINE' }] })],
    [/SafetyRatings\/modelyear/, json({ Data: [] })],
    ...routes,
  ]);
  const r = await buildReport(VIN, { fetch, include: { recallsCanada: false } });
  assert.equal(r.recallsUS, undefined);
  assert.equal(r.complaints, undefined);
  assert.equal(r.safetyRatings, undefined);
  assert.deepEqual(r.errorKinds, { recallsUS: 'format', complaints: 'format', safetyRatings: 'format' });
});

test('empty answers in the expected format are still "none"', () => {
  assert.deepEqual(parseRecalls({ Count: 0, results: [] }), []);
  assert.equal(parseComplaints({ count: 0, results: [] }).total, 0);
  assert.deepEqual(parseRecalls(null), [], 'a 404 means no data');
  assert.deepEqual(parseRecalls({ Count: 0, Message: 'No results found for this request' }), [], 'a count of 0 without a list');
  assert.throws(() => parseRecalls({ Count: 2, Message: 'Results returned successfully' }), /expected format/);
});

test('NHTSA being down is not blamed on the VIN', async () => {
  const down = stubFetch([[/vpic\.nhtsa\.dot\.gov/, json({}, 400)], ...routes]);
  const r1 = await buildReport(VIN, { fetch: down.fetch });
  assert.equal(r1.errorKinds.vehicle, 'refused');

  const changed = stubFetch([[/vpic\.nhtsa\.dot\.gov/, json({ results: [{ Make: 'HONDA' }] })], ...routes]);
  assert.equal((await buildReport(VIN, { fetch: changed.fetch })).errorKinds.vehicle, 'format');

  const unknown = stubFetch([[/vpic\.nhtsa\.dot\.gov/, json({ Results: [{ Make: '', Model: '', ModelYear: '', ErrorCode: '11' }] })], ...routes]);
  assert.equal((await buildReport(VIN, { fetch: unknown.fetch })).errorKinds.vehicle, 'unrecognized');
});

test('CLI text drops terminal control characters from API data', async () => {
  const evil = 'Inflator \u001b]0;pwned\u0007may \u001b[2J\u009b31mrupture.';
  const { fetch } = stubFetch([
    [/recallsByVehicle/, json({ results: [{ NHTSACampaignNumber: '03V123000', Component: 'AIR\u001b[31m BAGS', Summary: evil }] })],
    ...routes,
  ]);
  const text = formatReport(await buildReport(VIN, { fetch }));
  assert.doesNotMatch(text, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
  assert.match(text, /Inflator \]0;pwnedmay \[2J31mrupture\./);
  assert.match(text, /\n/, 'newlines stay');
});
