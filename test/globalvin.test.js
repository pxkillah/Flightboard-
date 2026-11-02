// GlobalVIN VIN Decode, with fetch stubbed in the response shape of a real call (GlobalVIN's free
// test VIN, 2026-11-01), trimmed to the fields the parser reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecode, decode, parseJob, carfaxReport, reportPdf } from '../src/sources/globalvin.js';
import { buildReport, formatReport } from '../src/report.js';

const KEY = 'gvk_live_test0123456789abcdef';
const VIN = 'LFMGJE720DS070251';
const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

const sample = {
  success: true,
  message: 'VIN decoded successfully (from cache)',
  data: {
    full_vin: VIN, model_year_from_vin: '2013', epc: 'toyota', matching_mode: 'exact_match',
    brand: '丰田', brand_en: 'Toyota', made_in_en: 'China', build_date: '201309', fromCache: true,
    model_list: [{
      Model_detail: '丰田 普拉多 4.0L 手自一体(5档) 四驱 TX-L 2010款', Model_detail_en: 'Toyota Prado 4.0L AMT(5-speed) Four-wheel Drive TX-L 2010',
      Brand: '丰田', Brand_en: 'Toyota', Series: '普拉多', Series_en: 'Prado', Model_year: '2010', Chassis_code: 'J150',
      Cc: '4.0L', Cc_en: '4.0L', Engine_no: '1GR', Engine_no_en: '1GR', Kw: '202', Hp: '275',
      Fuel_type: '汽油', Fuel_type_en: 'Gasoline', Transmission_detail: '手自一体变速器(AT)', Transmission_detail_en: 'Automatic transmission (AT)',
      Gear_num: '5', Gear_num_en: '5', Driving_mode: '前置四驱', Driving_mode_en: 'Front-engine AWD', Body_type: 'SUV', Body_type_en: 'SUV',
      Door_num: '五门', Door_num_en: '5 Door', Seat_num: '7', Effluent_standard: '国Ⅳ', Effluent_standard_en: 'China IV',
      Date_begin: '2010-06-22', Date_end: '2013-12-02',
    }],
  },
};
const noVpic = json({ Results: [{ Make: '', Model: '', ModelYear: '', ErrorCode: '1' }] });
const only = { recallsUS: false, recallsCanada: false, complaints: false, safetyRatings: false };

test('the decode reads the English names and the factory specs', () => {
  const g = parseDecode(sample);
  assert.equal(g.brand, 'Toyota');
  assert.equal(g.buildMonth, '2013-09');
  assert.equal(g.madeIn, 'China');
  assert.equal(g.exactMatch, true);
  assert.equal(g.cached, true);
  const [m] = g.models;
  assert.equal(m.description, 'Toyota Prado 4.0L AMT(5-speed) Four-wheel Drive TX-L 2010');
  assert.deepEqual([m.kw, m.hp, m.gears, m.seats], [202, 275, 5, 7]);
  assert.equal(m.drive, 'Front-engine AWD');
  assert.equal(m.doors, '5 Door', 'the English copy, not 五门');
});

test('a changed GlobalVIN format is an error, and a refusal says why', () => {
  assert.throws(() => parseDecode({ data: {} }), /expected format/);
  assert.throws(() => parseDecode({ success: true, data: { model_list: 'x' } }), /expected format/);
  assert.throws(() => parseDecode({ success: false, message: 'Insufficient credits. Required: $2, Available: $0.9' }), /Insufficient credits/);
  assert.equal(parseDecode(null), null, 'a 404 means no data');
  assert.deepEqual(parseDecode({ success: true, data: { model_list: [] } }).models, []);
});

test('decode posts the VIN with the key in a header, never the URL, and does not retry', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return json({ success: false, message: 'busy' }, 503); };
  await assert.rejects(decode(VIN, { apiKey: KEY, fetch }));
  assert.equal(calls.length, 1, 'a billed call is never retried');
  assert.equal(calls[0].url, 'https://globalvin.co/backend/api/vin/lookup/decode');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-api-key'], KEY);
  assert.deepEqual(JSON.parse(calls[0].init.body), { vin: VIN });
});

test('the API key never appears in an error, and the error says what GlobalVIN said', async () => {
  const fetch = async (url) => (/vpic/.test(url) ? noVpic
    : json({ success: false, message: `Invalid or expired API key ${KEY}` }, 401));
  const r = await buildReport(VIN, { globalvinKey: KEY, include: only, fetch });
  assert.equal(r.errorKinds.globalDecode, 'refused');
  assert.match(r.errors.globalDecode, /Invalid or expired API key \[key\]/);
  assert.doesNotMatch(JSON.stringify(r), new RegExp(KEY));
  assert.doesNotMatch(formatReport(r), new RegExp(KEY));
});

test('without a key the report never calls GlobalVIN', async () => {
  const calls = [];
  const r = await buildReport(VIN, { include: only, fetch: async (url) => { calls.push(url); return noVpic; } });
  assert.ok(calls.every((u) => !u.includes('globalvin')));
  assert.equal('globalDecode' in r, false);
  assert.doesNotMatch(formatReport(r), /GlobalVIN/);
});

test('GlobalVIN still runs when NHTSA does not recognize the VIN, and the CLI text shows it', async () => {
  const r = await buildReport(VIN, { globalvinKey: KEY, include: only, fetch: async (url) => (/vpic/.test(url) ? noVpic : json(sample)) });
  assert.equal(r.errorKinds.vehicle, 'unrecognized');
  assert.equal(r.globalDecode.models.length, 1);
  const text = formatReport(r);
  assert.match(text, /Factory model data \(GlobalVIN\): Toyota, model year 2013, built 2013-09, in China/);
  assert.match(text, /engine 1GR · 4\.0L · 202 kW \/ 275 hp · Gasoline · Automatic transmission \(AT\), 5 speeds · Front-engine AWD/);
  assert.match(text, /SUV · 5 Door · 7 seats · emissions China IV · produced 2010-06-22 to 2013-12-02/);
  assert.match(text, /Decoded before, so not billed again/);
});

test('no match is said plainly', async () => {
  const r = await buildReport(VIN, { globalvinKey: KEY, include: only, fetch: async (url) => (/vpic/.test(url) ? noVpic : json({}, 404)) });
  assert.equal(r.globalDecode, null);
  assert.match(formatReport(r), /Factory model data \(GlobalVIN\): no match for this VIN\./);
});

// Carfax via GlobalVIN: an order queues a job, polling the job ends with the report id.
const NA_VIN = '1HGCM82633A004352';
const honda = json({ Results: [{ Make: 'HONDA', Model: 'Accord', ModelYear: '2003', ErrorCode: '0' }] });
const queued = { success: true, message: 'Report queued', data: { jobId: 'job1', status: 'pending', reused: false } };
const finished = { success: true, message: 'Your report is ready!', data: { jobId: 'job1', status: 'completed', isComplete: true, isFailed: false,
  statusMessage: 'Your report is ready!', result: { success: true, vin: NA_VIN, reportType: 'carfax', reportId: 'GV-TEST01', freeRepeat: false } } };

test('a Carfax order is polled until the report is ready, and the PDF link is built from its id', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, key: init?.headers?.['x-api-key'] });
    if (url.endsWith(`/usa/report/carfax/${NA_VIN}`)) return json(queued);
    return json(calls.length < 3 ? queued : finished);
  };
  const c = await carfaxReport(NA_VIN, { apiKey: KEY, fetch, pollMs: 1 });
  assert.equal(c.reportId, 'GV-TEST01');
  assert.equal(c.pdfUrl, 'https://globalvin.co/backend/api/vhrs/GV-TEST01/pdf');
  assert.equal(calls.filter((x) => x.url.includes('/usa/report/carfax/')).length, 1, 'ordered once');
  assert.ok(calls.slice(1).every((x) => x.url.endsWith('/jobs/status/job1')));
  assert.ok(calls.every((x) => x.key === KEY && !x.url.includes(KEY)));
});

test('a failed or stuck Carfax job is an error that says so', async () => {
  const failed = { success: true, data: { jobId: 'job1', status: 'failed', isFailed: true, statusMessage: 'No records' } };
  await assert.rejects(carfaxReport(NA_VIN, { apiKey: KEY, pollMs: 1, fetch: async (url) => json(url.includes('/jobs/') ? failed : queued) }), /Carfax report failed \(No records\)/);
  await assert.rejects(carfaxReport(NA_VIN, { apiKey: KEY, pollMs: 1, maxWaitMs: 5, fetch: async () => json(queued) }), /wasn't ready after/);
  assert.throws(() => parseJob({ success: true, data: {} }), /expected format/);
  assert.throws(() => parseJob({ success: false, message: 'Insufficient credits. Required: $3, Available: $0.9' }), /Insufficient credits/);
});

test('Carfax runs only for a vehicle NHTSA recognizes; any other VIN is skipped and never ordered', async () => {
  const calls = [];
  const r = await buildReport(VIN, { carfaxKey: KEY, include: only, fetch: async (url) => { calls.push(url); return noVpic; } });
  assert.ok(calls.every((u) => !u.includes('globalvin')));
  assert.match(r.skipped.carfax, /not a North American vehicle/);
  assert.match(formatReport(r), /Carfax: skipped, not a North American vehicle .*Nothing was charged\./);
});

test('a North American VIN gets the Carfax section, and the key stays out of errors', async () => {
  const ok = await buildReport(NA_VIN, { carfaxKey: KEY, include: only,
    fetch: async (url) => (/vpic/.test(url) ? honda : json(finished)) }); // a repeat order can come back finished
  ok.carfax.file = '/Users/me/Downloads/Carfax 1HGCM82633A004352 2026-11-01.pdf';
  const text = formatReport(ok);
  assert.match(text, /Carfax report \(via GlobalVIN\): saved to \/Users\/me\/Downloads\/Carfax 1HGCM82633A004352 2026-11-01\.pdf/);
  assert.match(text, /don't publish or share it/);
  assert.doesNotMatch(text, /Not included: accident/);
  const refused = await buildReport(NA_VIN, { carfaxKey: KEY, include: only,
    fetch: async (url) => (/vpic/.test(url) ? honda : json({ success: false, message: `Invalid or expired API key ${KEY}` }, 401)) });
  assert.equal(refused.errorKinds.carfax, 'refused');
  assert.doesNotMatch(JSON.stringify(refused) + formatReport(refused), new RegExp(KEY));
});

test('the report file must be a PDF', async () => {
  const file = (bytes, status = 200) => async () => ({ ok: status < 400, status, arrayBuffer: async () => new TextEncoder().encode(bytes).buffer });
  assert.equal((await reportPdf('https://x/pdf', { fetch: file('%PDF-1.7 ...') })).length, 12);
  await assert.rejects(reportPdf('https://x/pdf', { fetch: file('<html>') }), /isn't a PDF/);
  await assert.rejects(reportPdf('https://x/pdf', { fetch: file('', 404) }), /HTTP 404/);
});
