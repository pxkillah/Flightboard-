// Transport Canada Motor Vehicle Safety Recalls Database (Open Government Licence - Canada).
// https://tc.canada.ca/en/road-transportation/motor-vehicle-safety/motor-vehicle-safety-recalls-database
// Responses are { ResultSet: [ [ {Name, Value:{Literal}} , ... ], ... ] } - one array of
// name/value cells per row. Column names are matched loosely since TC labels them in prose.
import { getJson, FormatError } from '../http.js';
import { isoDate } from '../dates.js';

const BASE = 'https://data.tc.gc.ca/v1.3/api/eng/vehicle-recall-database';

export function rowsToObjects(json) {
  if (json === null || json === undefined) return [];
  if (!Array.isArray(json.ResultSet)) throw new FormatError("Transport Canada's recall data");
  return json.ResultSet.map((row) => {
    const o = {};
    for (const cell of row ?? []) {
      const v = cell?.Value;
      o[cell?.Name] = v && typeof v === 'object' ? (v.Literal ?? v.DateTime ?? v.Decimal ?? null) : v;
    }
    return o;
  });
}

const pick = (o, re) => {
  const k = Object.keys(o).find((key) => re.test(key));
  return k === undefined ? undefined : o[k];
};

// The model-name search matches by prefix, so "Transit" also returns TRANSIT CONNECT rows. When
// some rows name the model exactly, rows for other models are dropped; when none do (TC may
// spell the model differently from vPIC), every row is kept.
const modelKey = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function parseRecalls(json, model) {
  let rows = rowsToObjects(json);
  if (model) {
    const want = modelKey(model);
    const exact = rows.filter((o) => modelKey(pick(o, /model/i)) === want);
    if (exact.length) rows = exact;
  }
  const seen = new Set();
  const out = [];
  for (const o of rows) {
    const number = pick(o, /recall\s*number/i);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    out.push({
      source: 'Transport Canada',
      campaign: String(number),
      date: isoDate(pick(o, /recall\s*date|date/i), 'mdy'),
      component: pick(o, /system|component/i),
      manufacturerRecallNumber: pick(o, /manufacturer\s*recall/i),
    });
  }
  return out;
}

export function parseSummary(json) {
  const o = rowsToObjects(json)[0];
  if (!o) return null;
  return {
    summary: pick(o, /comment|summary|description/i),
    units: pick(o, /units|unit\s*affected/i),
    notificationType: pick(o, /notification/i),
  };
}

const seg = (s) => encodeURIComponent(String(s).toLowerCase());

export async function recalls({ make, model, year }, { withDetails = true, ...opts } = {}) {
  const url = `${BASE}/recall/make-name/${seg(make)}/model-name/${seg(model)}/year-range/${year}-${year}`;
  const list = parseRecalls(await getJson(url, opts), model);
  if (withDetails) {
    for (const r of list) {
      const s = parseSummary(await getJson(`${BASE}/recall-summary/recall-number/${encodeURIComponent(r.campaign)}`, opts));
      if (s) Object.assign(r, s);
    }
  }
  return list;
}
