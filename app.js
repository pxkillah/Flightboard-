import { buildReport } from './src/report.js';
import { validateVin, normalizeVin } from './src/vin.js';
import { feedbackUrl } from './src/feedback.js';
import { makeRecord, sortRecords, summarize, historyText, parseBackup, mergeRecords, recordsCsv, fmtKm, fmtCents, localDate, readStore, backupText, pruneLookups, MAX_BACKUP_BYTES } from './src/records.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="ic${cls ? ` ${cls}` : ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const pill = (kind, ic, text) => `<span class="pill ${kind}">${icon(ic)}${esc(text)}</span>`;

// NHTSA's documentation example (a 2003 Honda Accord), used for the sample report.
const EXAMPLE_VIN = '1HGCM82633A004352';
const STORE = 'vin-report:v1';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PROVINCES = { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon' };
const ACRONYMS = new Set(['ABS', 'ESC', 'TPMS', 'AWD', 'RWD', 'FWD', '4WD', '2WD', 'LED', 'HVAC', 'EVAP', 'EGR', 'ECM', 'PCM', 'SRS', 'USA', 'SUV', 'MPV', 'CNG', 'LPG', 'EV', 'HEV', 'PHEV', 'BEV', 'DRL', 'ACC', 'NHTSA', 'II', 'III', 'GMC', 'BMW', 'LLC']);

let current = { vin: null, name: '', report: null, example: false };
let lookupSeq = 0;
let pendingDelete = null;
let chart = null;

// ---------- Formatting ----------
const words = (s) => String(s ?? '').toLowerCase().replace(/[a-z0-9]+/g, (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));
const sentence = (s) => { const t = words(s).trim(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
const titleCase = (s) => words(s).replace(/(^|[\s(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
const makeName = (m) => (!m ? '' : m.length <= 3 ? m.toUpperCase() : titleCase(m));
const component = (c) => String(c ?? '').split(':').map((p) => sentence(p)).filter(Boolean).join(' › ');
const num = (n) => Number(n).toLocaleString('en-CA');
const compact = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));
const isoDate = (d) => { const [y, m, day] = String(d).split('-').map(Number); return y && m >= 1 && m <= 12 && day ? `${day} ${MONTHS[m - 1]} ${y}` : String(d ?? ''); };
const monthYear = (d) => { const [y, m] = String(d).split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

// NHTSA's recall feed writes dates as day/month/year.
function parseNhtsaDate(s) {
  const m = String(s ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    let [day, month] = [Number(m[1]), Number(m[2])];
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (month >= 1 && month <= 12) return { y: Number(m[3]), m: month, d: day };
  }
  const iso = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) } : null;
}
function nhtsaDate(s) { const p = parseNhtsaDate(s); return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : String(s ?? ''); }
const nhtsaTime = (s) => { const p = parseNhtsaDate(s); return p ? Date.UTC(p.y, p.m - 1, p.d) : 0; };
const newestFirst = (a, b) => nhtsaTime(b.date) - nhtsaTime(a.date);

const vehicleName = (v) => [v.year, makeName(v.make), v.model, v.trim].filter(Boolean).join(' ');
const ymm = (v) => [makeName(v.make), v.model, v.year].filter(Boolean).join(' ');
function driveText(d) { if (!d) return ''; const parts = String(d).split('/'); return sentence(parts[1] ?? parts[0]); }
const bodyText = (b) => (b ? sentence(String(b).split('/')[0]) : '');
function engineText(v) {
  const cyl = Number(v.engineCylinders), cfg = String(v.engineConfig ?? '');
  const layout = !cyl ? '' : /^v/i.test(cfg) ? `V${cyl}` : /in-?line/i.test(cfg) ? `Inline-${cyl}` : /flat|horizontal|opposed/i.test(cfg) ? `Flat-${cyl}` : `${cyl}-cylinder`;
  const disp = Number(v.displacementL) ? `${Number(v.displacementL).toFixed(1)} L` : '';
  const hp = Number(v.engineHp) ? `${Math.round(Number(v.engineHp))} hp` : '';
  return [disp && layout ? `${disp} ${layout}` : disp || layout, /^yes/i.test(v.turbo ?? '') ? 'turbo' : '', hp].filter(Boolean).join(' · ');
}
function gvwrText(g) {
  const m = String(g).match(/^(Class\s+[^:]+):\s*(.+?)\s*\((.+?)\)\s*$/i);
  return m ? `${m[3].replace(/\s*-\s*/, '–')} · ${m[1]}` : String(g);
}
function builtText(v) {
  const country = v.plantCountry ? titleCase(v.plantCountry).replace(/\s*\((USA|US)\)$/i, '') : '';
  return [v.plantCity && titleCase(v.plantCity), v.plantState && titleCase(v.plantState), country].filter(Boolean).join(', ');
}
function vinProblems(vin) {
  const out = [];
  if (vin.length !== 17) out.push(`A VIN has 17 characters; this one has ${vin.length}.`);
  if (/[IOQ]/.test(vin)) out.push('VINs never use the letters I, O or Q. Try 1 or 0 instead.');
  if (/[^A-Z0-9]/.test(vin)) out.push('Use only letters and numbers.');
  if (!out.length) out.push("The 9th character (the check digit) doesn't match the others, so one character is probably mistyped.");
  return out;
}

// ---------- Storage (this device only) ----------
// readStore (src/records.js) upgrades older saved data and re-checks it. The result is cached
// by the raw string, and each call returns a fresh copy because callers change it in place.
let storeCache = { raw: undefined, json: '', problem: null };
function loadStore() {
  let raw = null;
  try { raw = localStorage.getItem(STORE); } catch { /* storage blocked: nothing saved */ }
  if (raw !== storeCache.raw) {
    const { data, dropped, problem } = readStore(raw);
    if (problem === 'unreadable' || dropped) {
      // Keep the original before anything writes over it, for recovery by hand (see docs/runbook.md).
      try { localStorage.setItem(`${STORE}:unreadable`, raw); } catch { /* nothing more to do */ }
      setTimeout(() => toast(problem === 'unreadable'
        ? "Your saved records couldn't be read. If you have a backup, restore it."
        : `${plural(dropped, 'saved record')} couldn't be read and ${dropped === 1 ? 'was' : 'were'} left out. If you have a backup, restore it.`, { long: true }));
    }
    storeCache = { raw, json: JSON.stringify(data), problem };
  }
  return JSON.parse(storeCache.json);
}
// Returns null when saved, or a message saying why not.
function saveStore(d) {
  if (storeCache.problem === 'newer') return 'A newer version of this page saved your records. Reload the page before changing them.';
  try {
    localStorage.setItem(STORE, JSON.stringify(d));
    return null;
  } catch (e) {
    return e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      ? 'Storage on this device is full. Save a backup, then remove vehicles you no longer need.'
      : "Couldn't save. This browser is blocking storage, for example in Private Browsing.";
  }
}
const recordsFor = (vin) => loadStore().vehicles[vin]?.records ?? [];
function updateVehicle(vin, patch) {
  const d = loadStore();
  d.vehicles[vin] = { name: '', records: [], ...d.vehicles[vin], ...patch };
  d.vehicles = pruneLookups(d.vehicles);
  return saveStore(d);
}
// Record changes are stamped so the page can tell when there's no backup of the latest ones.
function setRecords(vin, records) {
  const d = loadStore();
  const name = vin === current.vin && current.name ? current.name : undefined;
  d.vehicles[vin] = { name: '', ...d.vehicles[vin], records, ...(name && { name }) };
  d.lastChangeAt = Date.now();
  return saveStore(d);
}
// Every vehicle with records, and the 6 most recent lookups without any.
function recentVehicles() {
  const list = Object.entries(loadStore().vehicles)
    .filter(([vin, v]) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) && (v.lastViewed || v.records?.length))
    .map(([vin, v]) => ({ vin, name: v.name, records: v.records?.length ?? 0, lastViewed: v.lastViewed ?? 0 }))
    .sort((a, b) => b.lastViewed - a.lastViewed);
  const lookups = list.filter((v) => !v.records).slice(0, 6);
  return list.filter((v) => v.records || lookups.includes(v));
}

// ---------- Small UI helpers ----------
let toastTimer;
// action: { label, run } adds a button, such as Undo, and keeps the toast up for 8 seconds.
function toast(msg, { long = false, action = null } = {}) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('has-action', Boolean(action));
  if (action) {
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-btn', textContent: action.label });
    btn.addEventListener('click', () => { clearTimeout(toastTimer); t.classList.remove('show', 'has-action'); btn.remove(); action.run(); }, { once: true });
    t.append(btn);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show', 'has-action'); t.querySelector('.toast-btn')?.remove(); }, action ? 8000 : long ? 7000 : 2600);
}
const input = $('#vin');
function updateCounter() {
  const v = normalizeVin(input.value);
  const ok = v.length === 17 && validateVin(v).valid;
  const c = $('#vin-count');
  c.classList.toggle('ok', ok);
  c.innerHTML = ok ? `${icon('check')}17` : `${v.length}/17`;
}
function showSearchMsg(vin) {
  const checkDigitOnly = vin.length === 17 && !/[^A-HJ-NPR-Z0-9]/.test(vin);
  const el = $('#search-msg');
  el.innerHTML = `${icon('alert')}<span>${esc(vinProblems(vin).join(' '))}</span>${checkDigitOnly ? '<button type="button" class="link-btn" data-force>Look up anyway</button>' : ''}`;
  el.hidden = false;
}
const hideSearchMsg = () => { $('#search-msg').hidden = true; };
function showView(name) {
  $('#home').hidden = name !== 'home';
  $('#report').hidden = name !== 'report';
}

// ---------- Home ----------
function renderHome() {
  const list = recentVehicles();
  $('#recent-block').hidden = !list.length;
  $('#recent-list').innerHTML = list.map((v) => `<li><button type="button" class="vehicle" data-vin="${esc(v.vin)}">
      <span class="vehicle-icon">${icon('van')}</span>
      <span class="vehicle-text"><b><bdi>${esc(v.name || 'Vehicle')}</bdi></b><span class="mono">${esc(v.vin)}</span></span>
      <span class="vehicle-aside">${v.records ? esc(plural(v.records, 'record')) : ''}</span>${icon('chevron-right')}
    </button></li>`).join('');
}
function showHome() {
  lookupSeq++;
  current = { vin: null, name: '', report: null, example: false };
  chart = null;
  showView('home');
  renderHome();
  document.title = 'VIN Report';
  input.value = '';
  updateCounter();
  hideSearchMsg();
}

// ---------- Lookup ----------
async function lookup(raw, { push = true, example = false, force = false, retry = false } = {}) {
  const check = validateVin(raw);
  const vin = check.vin;
  input.value = vin;
  updateCounter();
  if (!check.valid && !force) { showSearchMsg(vin); return; }
  hideSearchMsg();
  // Repeat taps on Check while this VIN is loading would start the same lookup again.
  if (!retry && vin === current.vin && current.loading) return;
  if (push) {
    const sameVin = new URLSearchParams(location.search).get('vin') === vin;
    history[sameVin ? 'replaceState' : 'pushState']({ vin }, '', `?vin=${encodeURIComponent(vin)}${force ? '&force=1' : ''}`);
  }
  const seq = ++lookupSeq;
  current = { vin, name: '', report: null, example, loading: true };
  chart = null;
  showView('report');
  $('#report').innerHTML = skeleton();
  window.scrollTo(0, 0);
  let report;
  try {
    report = await buildReport(vin, { include: { recallsCanada: false }, force });
  } catch (e) {
    if (seq === lookupSeq) { current.loading = false; $('#report').innerHTML = failedPanel(e.message); }
    return;
  }
  if (seq !== lookupSeq) return;
  current.loading = false;
  const v = report.vehicle;
  current.report = report;
  current.name = v?.make ? vehicleName(v) : '';
  if (v?.make && !example) updateVehicle(vin, { name: current.name, lastViewed: Date.now() });
  document.title = current.name ? `${current.name} · VIN Report` : 'VIN Report';
  renderReport();
}

function skeleton() {
  const bar = (w, h, r = '.5rem') => `<div class="sk" style="width:${w};height:${h};border-radius:${r}"></div>`;
  return `<div class="sk-stack" aria-busy="true" aria-label="Loading the report">
    ${bar('34%', '14px')}${bar('72%', '38px')}
    <div class="sk-row">${bar('5.5rem', '28px', '999px')}${bar('7rem', '28px', '999px')}${bar('5rem', '28px', '999px')}</div>
    ${bar('100%', '56px')}
    <div class="tiles">${bar('100%', '116px', '14px').repeat(4)}</div>
    ${bar('100%', '240px', '18px')}
    <p class="fine">Contacting NHTSA. This can take up to 20 seconds.</p>
  </div>`;
}
function failedPanel(msg) {
  return `<section class="panel"><header class="panel-head"><span class="panel-icon">${icon('alert')}</span><h2>Couldn't load the report</h2></header>
    <p class="empty-line info">${icon('info')}<span>${esc(msg)}. Check your connection and try again.</span></p>
    <p class="gap-top"><button type="button" class="btn primary" data-retry>${icon('refresh')}Try again</button></p></section>`;
}

// ---------- Report ----------
function panel(id, ic, title, aside, body) {
  return `<section class="panel" id="${id}"><header class="panel-head"><span class="panel-icon">${icon(ic)}</span><h2>${esc(title)}</h2>${aside ? `<span class="panel-aside">${esc(aside)}</span>` : ''}</header>${body}</section>`;
}
// What went wrong, in words a person can act on. Kinds come from errorKind() in src/http.js.
const PROBLEMS = {
  unreachable: "Couldn't reach NHTSA. Check your internet connection, then try again.",
  timeout: 'NHTSA took too long to answer. Try again in a minute.',
  unavailable: "NHTSA's service isn't responding right now. Try again in a few minutes.",
  refused: "NHTSA couldn't answer for this vehicle.",
  format: "NHTSA sent this in a form the page doesn't recognize, so it isn't shown rather than risk showing it wrong. Please tell us with Send feedback below.",
};
const problem = (kind) => PROBLEMS[kind] ?? 'Something went wrong loading this from NHTSA. Try again.';
const loadError = (kind) => `<p class="load-error">${icon('alert')}<span>${esc(problem(kind))}</span><button type="button" class="link-btn" data-retry>Try again</button></p>`;

function renderReport() {
  const r = current.report;
  const v = r.vehicle;
  if (!v?.make) {
    const kind = r.errorKinds?.vehicle ?? 'unrecognized';
    // Only an answer without a make means the VIN is unknown. Any other failure is NHTSA's,
    // and the VIN shouldn't be blamed for it.
    $('#report').innerHTML = (kind === 'unrecognized'
      ? panel('decode', 'alert', "We couldn't decode this VIN", '',
        `<p class="empty-line info">${icon('info')}<span>NHTSA's decoder didn't recognize ${esc(r.vin)}. Check each character against the vehicle. VINs for vehicles built for markets outside North America may not decode.</span></p>`)
      : panel('decode', 'alert', "Couldn't load the report", '',
        `<p class="empty-line info">${icon('info')}<span>${esc(problem(kind))}${r.vinCheck?.valid ? ' The VIN itself looks right: its check digit matches.' : ''}</span></p>
        <p class="gap-top"><button type="button" class="btn primary" data-retry>${icon('refresh')}Try again</button></p>`))
      + '<section class="panel" id="records"></section>';
    renderRecords();
    return;
  }
  $('#report').innerHTML = identity(r) + alertBanner(r) + '<div class="tiles" id="tiles"></div>'
    + recallsPanel(r) + '<section class="panel" id="records"></section>' + complaintsPanel(r) + ratingsPanel(r);
  renderRecords();
}

function identity(r) {
  const v = r.vehicle;
  const chips = [bodyText(v.bodyClass), driveText(v.driveType), v.fuelType && sentence(v.fuelType)].filter(Boolean);
  const specs = [
    ['Engine', engineText(v)],
    ['Transmission', v.transmission && sentence(v.transmission)],
    ['Weight rating', v.gvwr && gvwrText(v.gvwr)],
    ['Built in', builtText(v)],
    ['Series', v.series],
  ].filter(([, x]) => x);
  const warnings = v.decodeWarnings ?? [];
  return `<header class="identity">
    <p class="eyebrow">${esc([v.year, makeName(v.make)].filter(Boolean).join(' · '))}</p>
    <h1>${esc([v.model, v.trim].filter(Boolean).join(' ') || makeName(v.make))}</h1>
    <div class="chips">${current.example ? `<span class="chip example">${icon('info')}Example vehicle</span>` : ''}${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    ${vinStrip(r.vin, v, r.vinCheck)}
    ${specs.length ? `<dl class="specs">${specs.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>` : ''}
    ${warnings.length ? `<p class="fine decode-note">${icon('info')}<span>${esc(warnings.join(' '))}</span></p>` : ''}
  </header>`;
}

// The 17 positions of a North American VIN, grouped the way the standard defines them.
function vinStrip(vin, v, check) {
  if (vin.length !== 17) return '';
  const segs = [
    [0, 3, 'Maker', 'World manufacturer identifier'],
    [3, 8, 'Model', 'Vehicle descriptor: model, body and engine'],
    [8, 9, 'Check', check.valid ? 'Check digit matches' : "Check digit doesn't match"],
    [9, 10, v.year ? String(v.year) : 'Year', 'Model year'],
    [10, 11, 'Plant', v.plantCity ? `Assembly plant: ${titleCase(v.plantCity)}` : 'Assembly plant'],
    [11, 17, 'Serial', 'Production serial number'],
  ];
  return `<div class="vin" role="group" aria-label="VIN ${esc(vin)}">${segs.map(([a, b, cap, tip], i) => `<div class="seg${i === 2 ? (check.valid ? ' ok' : ' bad') : ''}" title="${esc(tip)}"><b>${esc(vin.slice(a, b))}</b><span>${esc(cap)}</span></div>`).join('')}</div>`;
}

const likelyRecalls = (r) => (r.recallsUS ?? []).filter((x) => !x.mismatch?.length);

function alertBanner(r) {
  const likely = likelyRecalls(r);
  const park = likely.filter((x) => x.parkIt);
  const outside = likely.filter((x) => x.parkOutside && !x.parkIt);
  if (!park.length && !outside.length) return '';
  const text = park.length
    ? `${park.length === 1 ? 'A recall' : `${park.length} recalls`} for this model ${park.length === 1 ? 'says' : 'say'} not to drive it until it's repaired.`
    : `${outside.length === 1 ? 'A recall' : `${outside.length} recalls`} for this model ${outside.length === 1 ? 'warns' : 'warn'} of a fire risk. Park outside, away from buildings, until it's repaired.`;
  return `<div class="alert" role="alert">${icon('alert')}<div><strong>${park.length ? 'Do not drive' : 'Park outside'}</strong><p>${esc(text)} Ask a dealer whether it applies to this VIN.</p></div></div>`;
}

function renderTiles() {
  const el = $('#tiles');
  if (!el || !current.report) return;
  const r = current.report;
  const tile = (target, ic, label, value, sub) => `<a class="tile" href="#${target}"><span class="tile-label">${icon(ic)}${esc(label)}</span><span class="tile-value">${value}</span>${sub}</a>`;
  const sub = (text) => `<span class="tile-sub">${esc(text)}</span>`;

  const likely = likelyRecalls(r);
  const recalls = r.errors.recallsUS
    ? tile('recalls', 'shield', 'Recalls that may apply', '–', sub("Couldn't load"))
    : tile('recalls', 'shield', 'Recalls that may apply', num(likely.length),
      likely.some((x) => x.parkIt) ? pill('crit', 'alert', 'Do not drive') : likely.length ? pill('warn', 'alert', 'Ask a dealer') : pill('good', 'check', 'None found'));

  const recs = recordsFor(current.vin);
  const s = summarize(recs, { today: localDate() });
  const records = tile('records', 'gauge', 'My records', num(recs.length),
    !recs.length ? sub('Start a logbook') : s.odometerIssues.length ? pill('crit', 'alert', 'Odometer check') : sub(s.latestKm ? fmtKm(s.latestKm.km) : plural(s.serviceCount, 'service')));

  const c = r.complaints;
  const complaints = tile('complaints', 'chat', 'Owner complaints', c ? num(c.total) : '–',
    c ? sub(`${plural(c.crashes, 'crash', 'crashes')} · ${plural(c.fires, 'fire')}`) : sub(r.errors.complaints ? "Couldn't load" : ''));

  const overall = (r.safetyRatings ?? []).map((x) => Number(x.overall)).filter((n) => n >= 1 && n <= 5);
  const lo = Math.min(...overall), hi = Math.max(...overall);
  const ratings = tile('ratings', 'star', 'Crash rating', overall.length ? `${lo === hi ? lo : `${lo}–${hi}`}<small>/5</small>` : '–',
    sub(overall.length ? (r.safetyRatings.length > 1 ? `Overall, ${r.safetyRatings.length} versions` : 'Overall rating') : r.errors.safetyRatings ? "Couldn't load" : r.safetyRatings?.length ? 'No overall rating' : 'Not crash-tested'));

  el.innerHTML = recalls + records + complaints + ratings;
}

function recallItem(x) {
  const flags = [x.parkIt && pill('crit', 'alert', 'Do not drive'), x.parkOutside && pill('crit', 'alert', 'Park outside')].filter(Boolean).join('');
  const long = String(x.summary ?? '').length > 220;
  return `<article class="recall">
    ${flags ? `<div class="flags">${flags}</div>` : ''}
    <h3>${esc(component(x.component) || 'Recall')}</h3>
    <p class="recall-meta">${esc(nhtsaDate(x.date))} · NHTSA <span class="mono">${esc(x.campaign)}</span></p>
    ${(x.mismatch ?? []).map((m) => `<p class="why">${icon('info')}<span>Probably not this vehicle. ${esc(m)}</span></p>`).join('')}
    ${x.summary ? `<p class="recall-summary${long ? ' clamp' : ''}">${esc(x.summary)}</p>${long ? '<button type="button" class="link-btn" data-more>Read more</button>' : ''}` : ''}
    ${x.consequence || x.remedy ? `<details class="more-details"><summary>Risk and remedy</summary>${x.consequence ? `<p><b>Risk.</b> ${esc(x.consequence)}</p>` : ''}${x.remedy ? `<p><b>Remedy.</b> ${esc(x.remedy)}</p>` : ''}</details>` : ''}
  </article>`;
}

function recallsPanel(r) {
  const v = r.vehicle;
  let body;
  let aside = '';
  if (r.errors.recallsUS) body = loadError(r.errorKinds?.recallsUS);
  else if (!r.recallsUS?.length) body = `<p class="empty-line">${icon('check')}<span>NHTSA lists no recalls for the ${esc(ymm(v))}.</span></p>`;
  else {
    const likely = likelyRecalls(r).sort(newestFirst);
    const others = r.recallsUS.filter((x) => x.mismatch?.length).sort(newestFirst);
    aside = `${num(likely.length)} of ${num(r.recallsUS.length)} may apply`;
    body = likely.length
      ? `<div>${likely.map(recallItem).join('')}</div>`
      : `<p class="empty-line">${icon('check')}<span>None of the ${esc(plural(r.recallsUS.length, 'recall'))} for this model match this vehicle's specs.</span></p>`;
    if (others.length) {
      body += `<details class="others"><summary><span>${esc(plural(others.length, 'more recall'))} for this model that probably ${others.length === 1 ? "doesn't" : "don't"} apply</span>${icon('chevron')}</summary><div>${others.map(recallItem).join('')}</div></details>`;
    }
    body += `<p class="fine gap-top">Matched by comparing each recall's wording with this VIN's specs. To confirm, enter the VIN at <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">nhtsa.gov/recalls</a> or ask a dealer.</p>`;
  }
  body += `<div class="subpanel">
    <div class="subpanel-head"><strong>Canadian recalls</strong><span class="chip">${esc(ymm(v))}</span></div>
    <p>Transport Canada keeps its own recall list. It can't be loaded on this page, so search it for this make, model and year.</p>
    <a class="btn secondary small" href="https://tc.canada.ca/en/road-transportation/motor-vehicle-safety/motor-vehicle-safety-recalls-database" target="_blank" rel="noopener">Open Transport Canada${icon('external')}</a>
  </div>`;
  return panel('recalls', 'shield', 'Recalls', aside, body);
}

function complaintsPanel(r) {
  const c = r.complaints;
  let body;
  if (r.errors.complaints) body = loadError(r.errorKinds?.complaints);
  else if (!c) body = '';
  else if (!c.total) body = `<p class="empty-line">${icon('check')}<span>No owner complaints have been filed with NHTSA for this model.</span></p>`;
  else {
    const top = c.topComponents.slice(0, 6);
    const max = Math.max(...top.map((t) => t.count), 1);
    body = `<div class="figures">${[['Crashes', c.crashes], ['Fires', c.fires], ['Injuries', c.injuries], ['Deaths', c.deaths]].map(([k, n]) => `<div class="figure"><b>${num(n)}</b><span>${k}</span></div>`).join('')}</div>
      <h3 class="minor">Most reported problems</h3>
      <ol class="bars">${top.map((t) => `<li><span class="bar-label">${esc(component(t.component))}</span><span class="bar-row"><span class="bar" style="--p:${(t.count / max).toFixed(4)}"></span><span class="bar-val">${num(t.count)}</span></span></li>`).join('')}</ol>
      <p class="fine gap-top">Filed by owners with NHTSA and not verified. One complaint can name several problems.</p>`;
  }
  return panel('complaints', 'chat', 'Owner complaints', c && !r.errors.complaints ? `${num(c.total)} filed` : '', body);
}

function stars(val) {
  const n = Number(val);
  if (!(n >= 1 && n <= 5)) return '<span class="na">Not rated</span>';
  return `<span class="stars" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= n ? 'on' : 'off')).join('')}</span>`;
}
function ratingsPanel(r) {
  const list = r.safetyRatings;
  let body;
  if (r.errors.safetyRatings) body = loadError(r.errorKinds?.safetyRatings);
  else if (!list?.length) body = `<p class="empty-line info">${icon('info')}<span>NHTSA hasn't crash-tested this model. Its program covers most cars, SUVs and pickups; heavier vans and commercial models often aren't tested.</span></p>`;
  else body = list.map((x) => `<div class="rating"><p class="rating-name">${esc(x.description)}</p><dl class="stars-list">${[['Overall', x.overall], ['Frontal crash', x.frontCrash], ['Side crash', x.sideCrash], ['Rollover', x.rollover]].map(([k, val]) => `<div><dt>${k}</dt><dd>${stars(val)}</dd></div>`).join('')}</dl></div>`).join('');
  return panel('ratings', 'star', 'Crash ratings', '', body);
}

// ---------- My records ----------
const TYPE_ICON = { service: 'wrench', mileage: 'gauge', registration: 'plate' };
const TYPE_NAME = { service: 'Service', mileage: 'Odometer', registration: 'Registration' };
const provinceName = (p) => PROVINCES[p] ?? p ?? '';

function readings(records) {
  const flagged = new Set(summarize(records).odometerIssues.map((i) => i.record.id));
  return records.filter((r) => typeof r.km === 'number')
    .map((r) => ({ id: r.id, t: Date.parse(`${r.date}T12:00:00`), km: r.km, date: r.date, flag: flagged.has(r.id) }))
    .sort((a, b) => a.t - b.t || a.km - b.km);
}
function kmPerYear(pts) {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const days = (b.t - a.t) / 864e5;
  if (days < 60 || b.km <= a.km) return null;
  return Math.round(((b.km - a.km) / days) * 365.25 / 100) * 100;
}

function entryItem(r, flagged) {
  let title;
  const meta = [];
  if (r.type === 'service') {
    title = r.work || 'Service';
    if (typeof r.km === 'number') meta.push(fmtKm(r.km));
    if (r.shop) meta.push(r.shop);
    if (typeof r.costCents === 'number') meta.push(fmtCents(r.costCents));
  } else if (r.type === 'mileage') {
    title = fmtKm(r.km);
  } else {
    title = r.province ? `${provinceName(r.province)} registration` : 'Registration';
    if (r.plate) meta.push(`Plate ${r.plate}`);
    if (r.expiry) meta.push(`Expires ${isoDate(r.expiry)}`);
    if (typeof r.km === 'number') meta.push(fmtKm(r.km));
  }
  const confirming = pendingDelete === r.id;
  return `<li class="entry t-${esc(r.type)}">
    <span class="node">${icon(TYPE_ICON[r.type] ?? 'info')}</span>
    <div class="entry-body">
      <p class="entry-head"><span>${esc(TYPE_NAME[r.type] ?? '')}</span><time datetime="${esc(r.date)}">${esc(isoDate(r.date))}</time></p>
      <p class="entry-title" dir="auto">${esc(title)}</p>
      ${meta.length ? `<p class="entry-meta">${meta.map((m) => `<bdi>${esc(m)}</bdi>`).join(' · ')}</p>` : ''}
      ${flagged ? pill('crit', 'alert', 'Lower than an earlier reading') : ''}
      ${r.notes ? `<p class="entry-notes" dir="auto">${esc(r.notes)}</p>` : ''}
    </div>
    <button type="button" class="icon-btn del${confirming ? ' confirm' : ''}" data-del="${esc(r.id)}" aria-label="Delete this record">${confirming ? 'Delete?' : icon('trash')}</button>
  </li>`;
}

function renderRecords() {
  const el = $('#records');
  if (!el || !current.vin) return;
  const recs = recordsFor(current.vin);
  const head = `<header class="panel-head"><span class="panel-icon">${icon('gauge')}</span><h2>My records</h2><button type="button" class="btn primary small" data-add>${icon('plus')}Add</button></header>`;
  const store = loadStore();
  const backup = !recs.length ? ''
    : !store.lastBackupAt ? ' <b>No backup saved yet.</b>'
    : (store.lastChangeAt ?? 0) > store.lastBackupAt ? ` <b>Changed since your last backup on ${esc(isoDate(localDate(new Date(store.lastBackupAt))))}.</b>`
    : ` Last backup ${esc(isoDate(localDate(new Date(store.lastBackupAt))))}.`;
  const privacy = `<p class="fine gap-top${backup.includes('<b>') ? ' remind' : ''}">Saved on this device only. Safari can clear data for sites you haven't opened in a while, so add VIN Report to your Home Screen and save a backup now and then.${backup}</p>`;
  const forget = store.vehicles[current.vin] ? `<button type="button" class="btn ghost small" data-act="forget">${icon('trash')}Remove from this device</button>` : '';
  if (!recs.length) {
    el.innerHTML = `${head}<div class="records-empty">
        <h3>Start this vehicle's logbook</h3>
        <p>Log oil changes and repairs, odometer readings and registration renewals. You'll get a mileage chart, a warning if the odometer ever goes backwards, and a history you can share with a buyer or mechanic.</p>
        <button type="button" class="btn primary" data-add>${icon('plus')}Add the first record</button>
      </div>
      <div class="tools"><button type="button" class="btn ghost small" data-act="restore">${icon('upload')}Restore a backup</button>${forget}</div>${privacy}`;
    chart = null;
    renderTiles();
    return;
  }
  const s = summarize(recs, { today: localDate() });
  const pts = readings(recs);
  const flagged = new Set(s.odometerIssues.map((i) => i.record.id));
  const rate = kmPerYear(pts);

  let cluster = '';
  if (s.latestKm) {
    const km = String(Math.round(s.latestKm.km));
    const digits = km.padStart(6, '0');
    const lead = digits.length - km.length;
    cluster = `<div class="cluster">
      <span class="cluster-label">Odometer</span>
      <div class="drum" role="img" aria-label="${esc(fmtKm(s.latestKm.km))}">${[...digits].map((d, i) => `<span class="d${i < lead ? ' off' : ''}">${d}</span>`).join('')}<span class="unit">km</span></div>
      <span class="cluster-meta">Read ${esc(isoDate(s.latestKm.date))}${rate ? ` · about ${esc(num(rate))} km a year` : ''}</span>
    </div>`;
  }

  const pills = [];
  if (s.registrationStatus === 'expired') pills.push(pill('crit', 'alert', `Registration expired ${isoDate(s.latestRegistration.expiry)}`));
  else if (s.registrationStatus === 'expiring') pills.push(pill('warn', 'alert', `Registration expires ${isoDate(s.latestRegistration.expiry)}`));
  else if (s.registrationStatus === 'valid') pills.push(pill('good', 'check', `Registered until ${isoDate(s.latestRegistration.expiry)}`));
  if (s.serviceCount) pills.push(pill('neutral', 'wrench', `${plural(s.serviceCount, 'service')}${s.serviceCostCents ? ` · ${fmtCents(s.serviceCostCents)}` : ''}`));
  if (s.odometerIssues.length) pills.push(pill('crit', 'alert', s.odometerIssues.length === 1 ? 'Odometer check: 1 lower reading' : `Odometer check: ${s.odometerIssues.length} lower readings`));
  else if (pts.length >= 2) pills.push(pill('good', 'check', 'Odometer readings add up'));

  const chartBlock = pts.length >= 2
    ? `<figure class="chart"><figcaption><span>Odometer readings</span><span>${num(pts.length)}</span></figcaption><div class="chart-box" id="chart-box" tabindex="0" aria-label="Odometer readings over time. Use the arrow keys to step through readings."></div></figure>`
    : pts.length === 1 ? '<p class="fine gap-top">Add another odometer reading to see your mileage over time.</p>' : '';

  el.innerHTML = `${head}${cluster}
    ${pills.length ? `<div class="status-row">${pills.join('')}</div>` : ''}
    ${chartBlock}
    <ol class="timeline">${sortRecords(recs).map((r) => entryItem(r, flagged.has(r.id))).join('')}</ol>
    <div class="tools">
      <button type="button" class="btn secondary small" data-act="copy">${icon('copy')}Copy history</button>
      <button type="button" class="btn secondary small" data-act="backup">${icon('download')}Save backup</button>
      <button type="button" class="btn secondary small" data-act="csv">${icon('doc')}Export CSV</button>
      <button type="button" class="btn ghost small" data-act="restore">${icon('upload')}Restore</button>
      ${forget}
    </div>${privacy}`;
  renderTiles();
  bindChart(pts);
}

// ---------- Mileage chart ----------
const niceStep = (raw) => { const p = 10 ** Math.floor(Math.log10(raw)); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const resizer = 'ResizeObserver' in window ? new ResizeObserver(() => requestAnimationFrame(drawChart)) : null;

function bindChart(pts) {
  const box = $('#chart-box');
  resizer?.disconnect();
  if (!box) { chart = null; return; }
  chart = { pts, idx: -1 };
  drawChart();
  resizer?.observe(box);
  const nearest = (e) => {
    const x = e.clientX - box.getBoundingClientRect().left;
    let best = 0;
    chart.pts.forEach((p, i) => { if (Math.abs(chart.X(p.t) - x) < Math.abs(chart.X(chart.pts[best].t) - x)) best = i; });
    showPoint(best);
  };
  box.addEventListener('pointermove', nearest);
  box.addEventListener('pointerdown', nearest);
  box.addEventListener('pointerleave', hidePoint);
  box.addEventListener('focus', () => showPoint(chart.pts.length - 1));
  box.addEventListener('blur', hidePoint);
  box.addEventListener('keydown', (e) => {
    const n = chart.pts.length;
    const i = { ArrowLeft: Math.max(0, chart.idx - 1), ArrowRight: Math.min(n - 1, chart.idx + 1), Home: 0, End: n - 1 }[e.key];
    if (i !== undefined) { e.preventDefault(); showPoint(i); }
    if (e.key === 'Escape') hidePoint();
  });
}

function drawChart() {
  const box = $('#chart-box');
  if (!box || !chart) return;
  const { pts } = chart;
  const W = Math.max(260, Math.floor(box.clientWidth)), H = 210;
  const m = { l: 40, r: 12, t: 30, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  let t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const pad = Math.max((t1 - t0) * 0.05, 864e5 * 12);
  t0 -= pad; t1 += pad;
  const maxKm = Math.max(...pts.map((p) => p.km), 1);
  const step = niceStep(Math.max(maxKm / 4, 1));
  const yMax = Math.ceil(maxKm / step) * step;
  const X = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const Y = (v) => m.t + ih - (v / yMax) * ih;
  Object.assign(chart, { X, Y, W, idx: -1 });

  let grid = '', yLabels = '', xLabels = '';
  for (let v = 0; v <= yMax + 1e-6; v += step) {
    const y = Math.round(Y(v)) + 0.5;
    grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
    yLabels += `<text x="${m.l - 8}" y="${y + 4}" text-anchor="end">${v ? compact(v) : '0'}</text>`;
  }
  const years = [];
  for (let yr = new Date(t0).getFullYear(); yr <= new Date(t1).getFullYear() + 1; yr++) {
    const t = new Date(yr, 0, 1).getTime();
    if (t >= t0 && t <= t1) years.push([t, String(yr)]);
  }
  const ticks = years.length >= 2
    ? years.filter((_, i, a) => a.length <= 6 || i % 2 === 0)
    : [[pts[0].t, monthYear(pts[0].date)], [pts[pts.length - 1].t, monthYear(pts[pts.length - 1].date)]];
  ticks.forEach(([t, label], i) => {
    const x = X(t);
    const anchor = years.length >= 2 ? (x < m.l + 18 ? 'start' : x > W - m.r - 18 ? 'end' : 'middle') : (i === 0 ? 'start' : 'end');
    xLabels += `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(label)}</text>`;
  });

  const xy = pts.map((p) => [X(p.t).toFixed(1), Y(p.km).toFixed(1)]);
  const line = `M${xy.map((q) => q.join(',')).join('L')}`;
  const area = `${line}L${xy[xy.length - 1][0]},${Y(0)}L${xy[0][0]},${Y(0)}Z`;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const lx = X(last.t), ly = Y(last.km);
  const labelY = Y(prev.km) >= ly ? ly - 11 : ly + 20;
  const dots = pts.map((p, i) => `<circle class="pt${p.flag ? ' flag' : ''}" cx="${xy[i][0]}" cy="${xy[i][1]}" r="${i === pts.length - 1 ? 5 : 4}"/>`).join('');

  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <g class="grid">${grid}</g>
      <g class="axis">${yLabels}${xLabels}</g>
      <path class="area" d="${area}"/>
      <path class="line" d="${line}"/>
      <line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
      ${dots}
      <circle class="hl" r="6.5" cx="0" cy="0" visibility="hidden"/>
      <text class="end-label" x="${(lx + 5).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="end">${esc(fmtKm(last.km))}</text>
    </svg><div class="tip" hidden><b></b><span></span></div>`;
}

function showPoint(i) {
  const box = $('#chart-box');
  if (!box || !chart?.X) return;
  const p = chart.pts[i];
  chart.idx = i;
  const x = chart.X(p.t), y = chart.Y(p.km);
  const xh = box.querySelector('.xhair'), hl = box.querySelector('.hl'), tip = box.querySelector('.tip');
  xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
  hl.setAttribute('cx', x); hl.setAttribute('cy', y); hl.setAttribute('visibility', 'visible'); hl.classList.toggle('flag', p.flag);
  tip.querySelector('b').textContent = fmtKm(p.km);
  tip.querySelector('span').textContent = isoDate(p.date) + (p.flag ? ' · lower than earlier' : '');
  tip.hidden = false;
  const half = tip.offsetWidth / 2;
  tip.style.left = `${Math.min(Math.max(x, half + 2), chart.W - half - 2)}px`;
}
function hidePoint() {
  const box = $('#chart-box');
  if (!box) return;
  box.querySelector('.xhair')?.setAttribute('visibility', 'hidden');
  box.querySelector('.hl')?.setAttribute('visibility', 'hidden');
  const tip = box.querySelector('.tip');
  if (tip) tip.hidden = true;
  if (chart) chart.idx = -1;
}

// ---------- Add-record sheet ----------
const sheet = $('#sheet');
const form = $('#rec-form');
function setType(type) {
  form.querySelector(`input[name="type"][value="${type}"]`).checked = true;
  form.querySelectorAll('[data-for]').forEach((d) => { d.hidden = d.dataset.for !== type; });
  $('#km-optional').hidden = type === 'mileage';
}
function openSheet() {
  form.reset();
  const today = localDate();
  form.elements.date.value = today;
  form.elements.date.max = today;
  setType('service');
  $('#rec-err').hidden = true;
  if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
  history.pushState({ ...history.state, sheet: true }, '');
}
function closeSheet() { if (typeof sheet.close === 'function') sheet.close(); else sheet.removeAttribute('open'); }
form.addEventListener('change', (e) => { if (e.target.name === 'type') setType(e.target.value); });
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#rec-err');
  const { record, errors } = makeRecord(Object.fromEntries(new FormData(form)), { today: localDate() });
  if (errors.length) { err.textContent = errors.join(' '); err.hidden = false; return; }
  const problem = setRecords(current.vin, [...recordsFor(current.vin), record]);
  if (problem) {
    err.textContent = problem;
    err.hidden = false;
    return;
  }
  closeSheet();
  renderRecords();
  toast('Record saved');
  // Asks the browser not to clear this site's storage on its own; harmless if it says no.
  navigator.storage?.persist?.().catch(() => {});
});

// ---------- Feedback sheet ----------
const fbSheet = $('#fb-sheet');
const fbForm = $('#fb-form');
// The VIN named in the checkbox label. Kept here because current.vin can change while the
// sheet is open (for example on Back), and only the VIN the user saw may be sent.
let fbVin = null;
let fbPressOnBackdrop = false;
function openFeedback() {
  $('#fb-err').hidden = true;
  // Offer the VIN only while a report is showing, and leave it unticked: issues are public.
  fbVin = $('#report').hidden ? null : current.vin;
  $('#fb-vin-row').hidden = !fbVin;
  $('#fb-vin-text').textContent = fbVin ?? '';
  fbForm.elements.includeVin.checked = false;
  if (typeof fbSheet.showModal === 'function') fbSheet.showModal(); else fbSheet.setAttribute('open', '');
  history.pushState({ ...history.state, sheet: true }, '');
  $('#fb-message').focus();
}
function closeFeedback() { if (typeof fbSheet.close === 'function') fbSheet.close(); else fbSheet.removeAttribute('open'); }
$('#feedback-btn').addEventListener('click', openFeedback);
// A drag that starts in the textarea and ends on the backdrop also clicks the dialog; only
// a press that starts on the backdrop closes it. The draft is kept until it is sent.
fbSheet.addEventListener('pointerdown', (e) => { fbPressOnBackdrop = e.target === fbSheet; });
fbSheet.addEventListener('click', (e) => { if (e.target === fbSheet && fbPressOnBackdrop) closeFeedback(); });
fbForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#fb-err');
  const f = fbForm.elements;
  const vin = fbVin && f.includeVin.checked ? fbVin : undefined;
  const { url, errors } = feedbackUrl({ kind: f.kind.value, message: f.message.value, vin });
  if (errors.length) { err.textContent = errors.join(' '); err.hidden = false; return; }
  window.open(url, '_blank', 'noopener');
  closeFeedback();
  fbForm.reset();
  toast('Opened GitHub in a new tab');
});

// ---------- Copy, backup, restore ----------
async function copyHistory() {
  const text = historyText(current.vin, current.name, recordsFor(current.vin));
  try { await navigator.clipboard.writeText(text); toast('History copied'); return; } catch { /* fall back below */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand?.('copy');
  ta.remove();
  toast(ok ? 'History copied' : "Couldn't copy on this device");
}
function download(name, text, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function saveBackup() {
  const d = loadStore();
  download(`vin-report-backup-${localDate()}.json`, backupText(d.vehicles), 'application/json');
  d.lastBackupAt = Date.now();
  saveStore(d);
  renderRecords();
  toast('Backup file created');
}
function exportCsv() {
  download(`vin-report-${current.vin}-${localDate()}.csv`, recordsCsv(recordsFor(current.vin)), 'text/csv');
  toast('Spreadsheet file created');
}
function forgetVehicle() {
  const n = recordsFor(current.vin).length;
  if (!confirm(n ? `Remove this vehicle and its ${plural(n, 'record')} from this device? This can't be undone, so save a backup first if you might need them.` : 'Remove this vehicle from this device?')) return;
  const d = loadStore();
  delete d.vehicles[current.vin];
  const problem = saveStore(d);
  if (problem) { toast(problem, { long: true }); return; }
  history.pushState({}, '', location.pathname);
  showHome();
  toast('Vehicle removed from this device');
}
function eraseAll() {
  if (!confirm("Erase every vehicle and record VIN Report has saved on this device? This can't be undone, so save a backup first if you might need them.")) return;
  try {
    for (const key of Object.keys(localStorage)) if (key === STORE || key.startsWith(`${STORE}:`)) localStorage.removeItem(key);
  } catch { /* storage blocked: nothing saved */ }
  if (current.vin) renderRecords(); else renderHome();
  toast('All VIN Report data on this device was erased');
}
async function restoreBackup(file) {
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('That file is too big to be a VIN Report backup.');
    const { vehicles, skipped } = parseBackup(await file.text());
    const d = loadStore();
    let n = 0;
    for (const [vin, v] of Object.entries(vehicles)) {
      const prev = d.vehicles[vin] ?? { name: v.name, records: [] };
      d.vehicles[vin] = { ...prev, name: prev.name || v.name, records: mergeRecords(prev.records ?? [], v.records) };
      n += v.records.length;
    }
    const problem = saveStore(d);
    if (problem) throw new Error(problem);
    renderRecords();
    if (!current.vin) renderHome();
    toast(`Restored ${plural(n, 'record')}${skipped ? `. Skipped ${plural(skipped, 'record')} that ${skipped === 1 ? "wasn't" : "weren't"} valid.` : ''}`, { long: Boolean(skipped) });
  } catch (e) {
    toast(`Couldn't restore. ${e.message}`, { long: true });
  }
}

// ---------- Events ----------
input.addEventListener('input', () => { updateCounter(); hideSearchMsg(); });
$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); input.blur(); lookup(input.value); });
$('#logo').addEventListener('click', () => { history.pushState({}, '', location.pathname); showHome(); window.scrollTo(0, 0); });
$('#restore-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(f); });
// Opening a sheet adds a history entry, so Back closes the sheet instead of changing the
// page underneath it. Closing it any other way takes that entry back off.
let ownBack = false;
for (const d of [sheet, fbSheet]) {
  d.addEventListener('close', () => { if (history.state?.sheet) { ownBack = true; history.back(); } });
}
window.addEventListener('popstate', () => {
  const open = [sheet, fbSheet].find((d) => d.open);
  if (open) { open.close(); return; }
  if (ownBack) { ownBack = false; return; }
  route();
});
window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.matches('a.tile')) {
    // Scroll without touching the URL, so the report isn't reloaded.
    e.preventDefault();
    document.querySelector(t.getAttribute('href'))?.scrollIntoView();
  } else if (t.matches('[data-example]')) lookup(EXAMPLE_VIN, { example: true });
  else if (t.matches('[data-vin]')) lookup(t.dataset.vin);
  else if (t.matches('[data-force]')) lookup(input.value, { force: true });
  else if (t.matches('[data-retry]')) lookup(current.vin ?? input.value, { push: false, example: current.example, retry: true });
  else if (t.matches('[data-add]')) openSheet();
  else if (t.matches('[data-close]')) (fbSheet.contains(t) ? closeFeedback : closeSheet)();
  else if (t.matches('[data-work]')) { const w = form.elements.work; w.value = w.value ? `${w.value}, ${t.dataset.work}` : t.dataset.work; }
  else if (t.matches('[data-more]')) {
    const clamped = t.previousElementSibling.classList.toggle('clamp');
    t.textContent = clamped ? 'Read more' : 'Show less';
  } else if (t.matches('[data-del]')) {
    const id = t.dataset.del;
    if (pendingDelete === id) {
      pendingDelete = null;
      const vin = current.vin;
      const removed = recordsFor(vin).find((r) => r.id === id);
      const problem = setRecords(vin, recordsFor(vin).filter((r) => r.id !== id));
      if (problem) { toast(problem, { long: true }); return; }
      renderRecords();
      toast('Record deleted', { action: { label: 'Undo', run: () => {
        const again = setRecords(vin, mergeRecords(recordsFor(vin), [removed]));
        if (current.vin === vin) renderRecords();
        toast(again ?? 'Record restored');
      } } });
    } else {
      // Relabel in place so nothing else on the page is redrawn.
      const reset = (rid) => { const b = document.querySelector(`[data-del="${CSS.escape(rid)}"]`); if (b) { b.classList.remove('confirm'); b.innerHTML = icon('trash'); } };
      if (pendingDelete) reset(pendingDelete);
      pendingDelete = id;
      t.classList.add('confirm');
      t.textContent = 'Delete?';
      setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; reset(id); } }, 4000);
    }
  } else if (t.matches('[data-act="copy"]')) copyHistory();
  else if (t.matches('[data-act="backup"]')) saveBackup();
  else if (t.matches('[data-act="restore"]')) $('#restore-file').click();
  else if (t.matches('[data-act="csv"]')) exportCsv();
  else if (t.matches('[data-act="forget"]')) forgetVehicle();
  else if (t.matches('[data-act="erase"]')) eraseAll();
});

function route() {
  const params = new URLSearchParams(location.search);
  const vin = params.get('vin');
  if (vin && current.vin && normalizeVin(vin) === current.vin) return;
  if (vin) lookup(vin, { push: false, example: normalizeVin(vin) === EXAMPLE_VIN, force: params.get('force') === '1' });
  else showHome();
}
route();
