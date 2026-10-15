// NHTSA recalls, complaints and NCAP safety ratings. Free, no key.
// https://www.nhtsa.gov/nhtsa-datasets-and-apis
import { getJson } from '../http.js';

const BASE = 'https://api.nhtsa.gov';
const q = (o) => new URLSearchParams(o).toString();

export function parseRecalls(json) {
  return (json?.results ?? []).map((r) => ({
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
  const list = json?.results ?? [];
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
  const variants = await getJson(`${BASE}/SafetyRatings/modelyear/${path(year)}/make/${path(make)}/model/${path(model)}`, opts);
  const out = [];
  for (const v of variants?.Results ?? []) {
    const d = (await getJson(`${BASE}/SafetyRatings/VehicleId/${v.VehicleId}`, opts))?.Results?.[0];
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
