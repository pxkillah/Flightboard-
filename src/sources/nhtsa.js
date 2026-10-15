// NHTSA recalls, complaints and NCAP safety ratings. Free, no key.
// https://www.nhtsa.gov/nhtsa-datasets-and-apis
import { getJson, FormatError } from '../http.js';

const BASE = 'https://api.nhtsa.gov';
const q = (o) => new URLSearchParams(o).toString();

// A missing response (404) means no data. A response without the list these parsers read
// means NHTSA changed its format, which must not read as "no recalls" or "no complaints".
function listOf(json, key, what) {
  if (json === null || json === undefined) return [];
  if (Array.isArray(json[key])) return json[key];
  // An empty answer may leave the list out. That's only "none" when its count says so.
  const count = json.Count ?? json.count;
  if (count === 0 || count === '0') return [];
  throw new FormatError(what);
}
// A renamed field leaves every item without it; one odd item doesn't count.
function requireField(list, field, what) {
  if (list.length && !list.some((x) => x && typeof x === 'object' && field in x)) throw new FormatError(what);
  return list;
}

export function parseRecalls(json) {
  const list = requireField(listOf(json, 'results', "NHTSA's recall data"), 'NHTSACampaignNumber', "NHTSA's recall data");
  return list.map((r) => ({
    source: 'NHTSA',
    campaign: r.NHTSACampaignNumber,
    date: r.ReportReceivedDate,
    component: r.Component,
    summary: r.Summary,
    consequence: r.Consequence,
    remedy: r.Remedy,
    parkIt: Boolean(r.parkIt),
    parkOutside: Boolean(r.parkOutSide),
  }));
}

export async function recalls({ make, model, year }, opts) {
  return parseRecalls(await getJson(`${BASE}/recalls/recallsByVehicle?${q({ make, model, modelYear: year })}`, opts));
}

export function parseComplaints(json) {
  const list = requireField(listOf(json, 'results', "NHTSA's complaint data"), 'components', "NHTSA's complaint data");
  const byComponent = {};
  let crashes = 0, fires = 0, injuries = 0, deaths = 0;
  for (const c of list) {
    // Components are joined with a bare comma; names like "SERVICE BRAKES, HYDRAULIC" contain ", ".
    for (const comp of String(c.components ?? 'UNKNOWN').split(/,(?=\S)/)) {
      const k = comp.trim() || 'UNKNOWN';
      byComponent[k] = (byComponent[k] ?? 0) + 1;
    }
    if (c.crash) crashes++;
    if (c.fire) fires++;
    injuries += Number(c.numberOfInjuries) || 0;
    deaths += Number(c.numberOfDeaths) || 0;
  }
  const topComponents = Object.entries(byComponent).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([component, count]) => ({ component, count }));
  return { source: 'NHTSA', total: list.length, crashes, fires, injuries, deaths, topComponents };
}

export async function complaints({ make, model, year }, opts) {
  return parseComplaints(await getJson(`${BASE}/complaints/complaintsByVehicle?${q({ make, model, modelYear: year })}`, opts));
}

export async function safetyRatings({ make, model, year }, opts) {
  const path = (s) => encodeURIComponent(String(s));
  const what = "NHTSA's crash-rating data";
  const variants = requireField(listOf(await getJson(`${BASE}/SafetyRatings/modelyear/${path(year)}/make/${path(make)}/model/${path(model)}`, opts), 'Results', what), 'VehicleId', what);
  const out = [];
  for (const v of variants) {
    const d = requireField(listOf(await getJson(`${BASE}/SafetyRatings/VehicleId/${v.VehicleId}`, opts), 'Results', what), 'OverallRating', what)[0];
    if (!d) continue;
    out.push({
      source: 'NHTSA NCAP',
      description: d.VehicleDescription,
      overall: d.OverallRating,
      frontCrash: d.OverallFrontCrashRating,
      sideCrash: d.OverallSideCrashRating,
      rollover: d.RolloverRating,
    });
  }
  return out;
}
