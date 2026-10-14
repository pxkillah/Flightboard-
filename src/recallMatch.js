// Recall feeds are keyed by year/make/model, so a model's list includes campaigns for
// configurations this vehicle doesn't have. These checks compare the recall's own wording
// with the decoded VIN and return the reasons it probably doesn't apply. They only fire on
// an explicit mismatch, so when in doubt a recall is kept.

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
const DRIVE_NAMES = { awd: 'all-wheel or four-wheel drive', rwd: 'rear-wheel drive', fwd: 'front-wheel drive' };

export function recallMismatch(recall, vehicle) {
  if (!vehicle) return [];
  const text = `${recall.summary ?? ''} ${recall.component ?? ''}`.toLowerCase();
  const reasons = [];

  const drive = driveOf(vehicle);
  if (drive) {
    const named = Object.keys(DRIVE_PHRASES).filter((k) => DRIVE_PHRASES[k].test(text));
    if (named.length && !named.includes(drive)) {
      reasons.push(`It covers vehicles with ${named.map((k) => DRIVE_NAMES[k]).join(' or ')}; yours is ${DRIVE_NAMES[drive]}.`);
    }
  }

  const fuel = String(vehicle.fuelType ?? '').toLowerCase();
  const isElectric = /electric/.test(fuel) || has(vehicle.electrification, /BEV|battery electric/i);
  if (fuel && !isElectric && /\be-transit\b|\bbattery[- ]electric\b|\belectric vehicles?\b|\bhigh[- ]voltage battery\b/.test(text)) {
    reasons.push('It covers electric vehicles; yours runs on ' + fuel + '.');
  }
  if (fuel && !/diesel/.test(fuel) && /\bdiesel\b/.test(text) && !/\bgas(?:oline)?\b/.test(text)) {
    reasons.push('It covers diesel engines; yours runs on ' + fuel + '.');
  }
  if (/diesel/.test(fuel) && /\bgasoline engines?\b/.test(text) && !/\bdiesel\b/.test(text)) {
    reasons.push('It covers gasoline engines; yours is diesel.');
  }

  const notTurbo = has(vehicle.turbo, /^no$/i) || (vehicle.engineModel && !has(vehicle.engineModel, /ecoboost/i));
  if (notTurbo && /\becoboost\b/.test(text)) {
    reasons.push('It covers EcoBoost (turbocharged) engines; yours is not turbocharged.');
  }

  const disp = Number(vehicle.displacementL);
  if (disp) {
    const mentioned = [...text.matchAll(/\b(\d\.\d)\s?-?(?:l|liter|litre)\b/g)].map((m) => Number(m[1]));
    if (mentioned.length && !mentioned.some((d) => Math.abs(d - disp) < 0.15)) {
      reasons.push(`It covers ${[...new Set(mentioned)].map((d) => d.toFixed(1) + 'L').join(' / ')} engines; yours is ${disp.toFixed(1)}L.`);
    }
  }

  const roof = roofOf(vehicle);
  if (roof) {
    const roofs = [...text.matchAll(/\b(low|medium|mid|high)[- ]roof\b/g)].map((m) => (m[1] === 'mid' ? 'medium' : m[1]));
    if (roofs.length && !roofs.includes(roof)) {
      reasons.push(`It covers ${[...new Set(roofs)].join(' / ')}-roof vans; yours is ${roof} roof.`);
    }
  }
  return reasons;
}
