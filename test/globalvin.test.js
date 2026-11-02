// GlobalVIN VIN Decode, with fetch stubbed in the response shape of a real call (GlobalVIN's free
// test VIN, 2026-11-01), trimmed to the fields the parser reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecode, decode } from '../src/sources/globalvin.js';
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
