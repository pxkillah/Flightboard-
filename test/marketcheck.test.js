// MarketCheck History by VIN, with fetch stubbed in the documented response shape: a JSON array
// of listings, 50 per page, and a 422 for a page past the last one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory, summarizeHistory, history } from '../src/sources/marketcheck.js';
import { buildReport, formatReport } from '../src/report.js';

const KEY = 'test-key-0123456789abcdef';
const VIN = '1FTBR1X87LKA22229';
const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

const listing = (first, last, o = {}) => ({
  id: `L-${first}`, price: null, miles: null, inventory_type: 'new', seller_type: 'dealer',
  seller_name: 'Pine Tree Ford', city: 'Vaughan', state: 'ON', source: 'pinetreeford.com',
  first_seen_at_date: `${first}T00:00:00.000Z`, last_seen_at_date: `${last}T00:00:00.000Z`, ...o,
});
const sample = [
  listing('2020-01-19', '2020-02-03', { price: 49315 }),
  listing('2020-02-05', '2020-03-03', { price: 47688 }),
  listing('2020-08-02', '2020-08-05', { price: 43388 }),
  listing('2021-12-17', '2021-12-17', { inventory_type: 'used', miles: 65230, seller_name: 'Pine Tree Ford Lincoln', city: 'Woodbridge' }),
];

test('listings in a province read as km and CAD, US ones as miles and USD', () => {
  const [ca, us] = parseHistory([
    listing('2021-12-17', '2021-12-17', { miles: 65230, price: 30000 }),
    listing('2019-03-01', '2019-04-01', { miles: 12000, state: 'NY' }),
  ]);
  assert.deepEqual(ca.odometer, { value: 65230, unit: 'km' });
  assert.equal(ca.currency, 'CAD');
  assert.deepEqual(us.odometer, { value: 12000, unit: 'mi' });
  assert.equal(us.currency, 'USD');
  assert.equal(ca.firstSeen, '2021-12-17');
});

test('a missing or zero price and mileage is "not given", not zero', () => {
  const [l] = parseHistory([listing('2020-01-10', '2020-07-28', { miles: 0, price: 0 })]);
  assert.equal(l.price, null);
  assert.equal(l.odometer, null);
});

test('a changed MarketCheck format is an error, never "no listings"', () => {
  assert.throws(() => parseHistory({ listings: [] }), /expected format/);
  assert.throws(() => parseHistory([{ when: '2020-01-01' }]), /expected format/);
  assert.deepEqual(parseHistory([]), []);
  assert.deepEqual(parseHistory(null), [], 'a 404 means no data');
});

test('listings group into stays on the market, with the asking price over time', () => {
  const h = summarizeHistory(parseHistory(sample));
  assert.equal(h.stints.length, 2);
  assert.deepEqual(
    { from: h.stints[0].from, to: h.stints[0].to, listings: h.stints[0].listings, firstPrice: h.stints[0].firstPrice, lastPrice: h.stints[0].lastPrice },
    { from: '2020-01-19', to: '2020-08-05', listings: 3, firstPrice: 49315, lastPrice: 43388 },
  );
  assert.equal(h.stints[1].condition, 'used');
  assert.deepEqual(h.stints[1].odometer, { value: 65230, unit: 'km' });
  assert.deepEqual(h.odometerIssues, []);
});

test('the same seller listing again much later is a separate stay', () => {
  const h = summarizeHistory(parseHistory([listing('2020-01-01', '2020-02-01'), listing('2021-06-01', '2021-07-01')]));
  assert.equal(h.stints.length, 2);
});

test('an advertised reading clearly lower than an earlier one is flagged', () => {
  const h = summarizeHistory(parseHistory([
    listing('2021-01-01', '2021-02-01', { miles: 40000, state: 'NY' }),
    listing('2022-01-01', '2022-02-01', { miles: 50000 }), // 50,000 km in Ontario is about 31,000 miles
    listing('2022-06-01', '2022-07-01', { miles: 64000 }), // and 64,000 km is within rounding of 40,000 mi
  ]));
  assert.equal(h.odometerIssues.length, 1);
  assert.equal(h.odometerIssues[0].listing.firstSeen, '2022-01-01');
});

test('history pages through results and stops at a short page', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return json(page === 1 ? Array.from({ length: 50 }, (_, i) => listing(`2020-01-${String(1 + (i % 28)).padStart(2, '0')}`, '2020-02-01')) : sample);
  };
  const list = await history(VIN, { apiKey: KEY, fetch });
  assert.equal(list.length, 54);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/v2\/history\/car\/1FTBR1X87LKA22229\?/);
  assert.equal(new URL(calls[0]).searchParams.get('api_key'), KEY);
});

test('a 422 past the last page ends the history', async () => {
  const fetch = async (url) => (new URL(url).searchParams.get('page') === '1'
    ? json(Array.from({ length: 50 }, () => listing('2020-01-01', '2020-02-01')))
    : json({ code: 422, message: 'Page exceeds number of records found' }, 422));
  assert.equal((await history(VIN, { apiKey: KEY, fetch })).length, 50);
});

test('the API key never appears in an error', async () => {
  const fetch = async () => json({ message: 'Invalid authentication credentials' }, 401);
  const r = await buildReport(VIN, {
    marketcheckKey: KEY,
    include: { recallsUS: false, recallsCanada: false, complaints: false, safetyRatings: false },
    fetch: async (url) => (/vpic/.test(url)
      ? json({ Results: [{ Make: 'FORD', Model: 'Transit', ModelYear: '2020', ErrorCode: '0' }] })
      : fetch(url)),
  });
  assert.equal(r.errorKinds.listingHistory, 'refused');
  assert.doesNotMatch(JSON.stringify(r), new RegExp(KEY));
  assert.doesNotMatch(formatReport(r), new RegExp(KEY));
  assert.match(r.errors.listingHistory, /\[key\]/);
});

test('without a key the report never calls MarketCheck', async () => {
  const calls = [];
  const r = await buildReport(VIN, {
    include: { recallsUS: false, recallsCanada: false, complaints: false, safetyRatings: false },
    fetch: async (url) => { calls.push(url); return json({ Results: [{ Make: 'FORD', Model: 'Transit', ModelYear: '2020', ErrorCode: '0' }] }); },
  });
  assert.ok(calls.every((u) => !u.includes('marketcheck')));
  assert.equal(r.listingHistory, undefined);
  assert.match(formatReport(r), /Not included: accident, odometer, ownership/);
});

test('the CLI text shows the listing history and what it covers', async () => {
  const r = await buildReport(VIN, {
    marketcheckKey: KEY,
    include: { recallsUS: false, recallsCanada: false, complaints: false, safetyRatings: false },
    fetch: async (url) => (/vpic/.test(url)
      ? json({ Results: [{ Make: 'FORD', Model: 'Transit', ModelYear: '2020', ErrorCode: '0' }] })
      : json(sample)),
  });
  const text = formatReport(r);
  assert.match(text, /Listing history \(MarketCheck\): 4 listings, 2020-01-19 to 2021-12-17/);
  assert.match(text, /2020-01-19 to 2020-08-05 {2}new, Pine Tree Ford \(Vaughan ON\) · \$49,315 CAD -> \$43,388 CAD · 3 listings/);
  assert.match(text, /2021-12-17 {2}used, Pine Tree Ford Lincoln \(Woodbridge ON\) · 65,230 km/);
  assert.match(text, /as advertised, not verified/);
  assert.match(text, /Not included: accident, ownership/);
});
