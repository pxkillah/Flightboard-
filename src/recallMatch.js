// Recall feeds are keyed by year/make/model, so a model's list includes campaigns for
// configurations this vehicle doesn't have. These checks compare the recall's own wording
// with the decoded VIN and return the reasons it probably doesn't apply. They only fire on
// an explicit mismatch, so when in doubt a recall is kept. Reasons come in English or
// French (lang); the recall text they're matched against is NHTSA's English.
import { t, fmtNumber } from './i18n.js';

const has = (s, re) => re.test(String(s ?? ''));

function driveOf(v) {
  const d = String(v.driveType ?? '').toLowerCase();
  if (!d) return null;
  if (/awd|all[- ]wheel|4wd|4x4|four[- ]wheel/.test(d)) return 'awd';
  if (/rwd|rear[- ]wheel/.test(d)) return 'rwd';
  if (/fwd|front[- ]wheel/.test(d)) return 'fwd';
  return null;
}

function roofOf(v) {
  const m = `${v.trim ?? ''} ${v.series ?? ''} ${v.bodyClass ?? ''}`.toLowerCase().match(/\b(low|medium|mid|high)[- ]roof\b/);
  return m ? (m[1] === 'mid' ? 'medium' : m[1]) : null;
}

const DRIVE_PHRASES = {
  awd: /\b(?:equipped with|with|have|having)\s+(?:an?\s+)?(?:all[- ]wheel[- ]drive|awd|four[- ]wheel[- ]drive|4wd|4x4)\b|\b(?:awd|4wd|4x4|all[- ]wheel[- ]drive)\s+(?:vehicles|models|versions)\b/,
  rwd: /\b(?:equipped with|with|have|having)\s+(?:an?\s+)?(?:rear[- ]wheel[- ]drive|rwd)\b|\b(?:rwd|rear[- ]wheel[- ]drive)\s+(?:vehicles|models|versions)\b/,
  fwd: /\b(?:equipped with|with|have|having)\s+(?:an?\s+)?(?:front[- ]wheel[- ]drive|fwd)\b|\b(?:fwd|front[- ]wheel[- ]drive)\s+(?:vehicles|models|versions)\b/,
};
// NHTSA's fuel names in French; English keeps NHTSA's own wording.
const FUELS_FR = [
  [/flex|ffv/, 'polycarburant'], [/natural gas|cng/, 'gaz naturel'], [/propane|lpg/, 'propane'],
  [/ethanol|e85/, 'éthanol'], [/hydrogen/, 'hydrogène'], [/electric/, 'électricité'],
  [/diesel/, 'diesel'], [/gasoline|gas/, 'essence'],
];
const fuelName = (fuel, lang) => (lang === 'fr' ? FUELS_FR.find(([re]) => re.test(fuel))?.[1] ?? fuel : fuel);
const litres = (d, lang) => (lang === 'fr' ? `${fmtNumber(d, 'fr', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u00a0L` : `${d.toFixed(1)}L`);

export function recallMismatch(recall, vehicle, { lang = 'en' } = {}) {
  if (!vehicle) return [];
  const text = `${recall.summary ?? ''} ${recall.component ?? ''}`.toLowerCase();
  const reasons = [];

  const drive = driveOf(vehicle);
  if (drive) {
    const named = Object.keys(DRIVE_PHRASES).filter((k) => DRIVE_PHRASES[k].test(text));
    if (named.length && !named.includes(drive)) {
      reasons.push(t(lang, 'match.drive', { named: named.map((k) => t(lang, `match.${k}`)).join(t(lang, 'match.or')), drive: t(lang, `match.${drive}`) }));
    }
  }

  const fuel = String(vehicle.fuelType ?? '').toLowerCase();
  const isElectric = /electric/.test(fuel) || has(vehicle.electrification, /BEV|battery electric/i);
  if (fuel && !isElectric && /\be-transit\b|\bbattery[- ]electric\b|\belectric vehicles?\b|\bhigh[- ]voltage battery\b/.test(text)) {
    reasons.push(t(lang, 'match.electric', { fuel: fuelName(fuel, lang) }));
  }
  if (fuel && !/diesel/.test(fuel) && /\bdiesel\b/.test(text) && !/\bgas(?:oline)?\b/.test(text)) {
    reasons.push(t(lang, 'match.diesel', { fuel: fuelName(fuel, lang) }));
  }
  if (/diesel/.test(fuel) && /\bgasoline engines?\b/.test(text) && !/\bdiesel\b/.test(text)) {
    reasons.push(t(lang, 'match.gasoline'));
  }

  const notTurbo = has(vehicle.turbo, /^no$/i) || (vehicle.engineModel && !has(vehicle.engineModel, /ecoboost/i));
  if (notTurbo && /\becoboost\b/.test(text)) {
    reasons.push(t(lang, 'match.ecoboost'));
  }

  const disp = Number(vehicle.displacementL);
  if (disp) {
    const mentioned = [...text.matchAll(/\b(\d\.\d)\s?-?(?:l|liter|litre)\b/g)].map((m) => Number(m[1]));
    if (mentioned.length && !mentioned.some((d) => Math.abs(d - disp) < 0.15)) {
      reasons.push(t(lang, 'match.displacement', { sizes: [...new Set(mentioned)].map((d) => litres(d, lang)).join(' / '), size: litres(disp, lang) }));
    }
  }

  const roof = roofOf(vehicle);
  if (roof) {
    const roofs = [...text.matchAll(/\b(low|medium|mid|high)[- ]roof\b/g)].map((m) => (m[1] === 'mid' ? 'medium' : m[1]));
    if (roofs.length && !roofs.includes(roof)) {
      reasons.push(t(lang, 'match.roof', { roofs: [...new Set(roofs)].map((r) => t(lang, `roof.${r}`)).join(' / '), roof: t(lang, `roof.${roof}`) }));
    }
  }
  return reasons;
}
