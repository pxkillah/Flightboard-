import { buildReport } from './src/report.js';
import { validateVin, normalizeVin } from './src/vin.js';
import { feedbackUrl } from './src/feedback.js';
import { recallMismatch } from './src/recallMatch.js';
import { makeRecord, sortRecords, summarize, historyText, parseBackup, mergeRecords, recordsCsv, readingOf, convert, fmtReading, localDate, readStore, backupText, pruneLookups, MAX_BACKUP_BYTES } from './src/records.js';
import { t as translate, pickLang, fmtNumber, fmtDate, fmtMonthYear, fmtDistance, fmtMoney, LOCALE } from './src/i18n.js';
import { regionName, regionOptions } from './src/regions.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="ic${cls ? ` ${cls}` : ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const pill = (kind, ic, text) => `<span class="pill ${kind}">${icon(ic)}${esc(text)}</span>`;

// NHTSA's documentation example (a 2003 Honda Accord), used for the sample report.
const EXAMPLE_VIN = '1HGCM82633A004352';
const STORE = 'vin-report:v1';
// Under the store's prefix, so Erase all clears it too.
const LANG_KEY = `${STORE}:lang`;
const TC_RECALLS = 'https://tc.canada.ca/en/road-transportation/motor-vehicle-safety/motor-vehicle-safety-recalls-database';
const ACRONYMS = new Set(['ABS', 'ESC', 'TPMS', 'AWD', 'RWD', 'FWD', '4WD', '2WD', 'LED', 'HVAC', 'EVAP', 'EGR', 'ECM', 'PCM', 'SRS', 'USA', 'SUV', 'MPV', 'CNG', 'LPG', 'EV', 'HEV', 'PHEV', 'BEV', 'DRL', 'ACC', 'NHTSA', 'II', 'III', 'GMC', 'BMW', 'LLC']);

let current = { vin: null, name: '', report: null, example: false };
let lookupSeq = 0;
let pendingDelete = null;
let chart = null;

// ---------- Language ----------
// English or French: a ?lang= link or an earlier choice wins, then the device's languages.
let lang = 'en';
const t = (key, params) => translate(lang, key, params);
function initLang() {
  const param = new URLSearchParams(location.search).get('lang');
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch { /* storage blocked */ }
  lang = pickLang({ param, saved, languages: navigator.languages?.length ? navigator.languages : [navigator.language] });
  if (param === 'en' || param === 'fr') { try { localStorage.setItem(LANG_KEY, param); } catch { /* storage blocked */ } }
}
// Puts the current language's text into the static markup: data-i18n sets the text,
// data-i18n-html sets markup from the dictionary (never from user input), and
// data-i18n-attr sets attributes ("placeholder:key,aria-label:key").
function applyStatic() {
  document.documentElement.lang = LOCALE[lang];
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      el.setAttribute(attr, t(key));
    }
  }
  for (const el of document.querySelectorAll('[data-work-key]')) { el.dataset.work = t(el.dataset.workKey); el.textContent = el.dataset.work; }
  for (const el of document.querySelectorAll('[data-lang-toggle]')) {
    el.textContent = t('lang.other');
    el.lang = lang === 'fr' ? 'en' : 'fr';
    el.setAttribute('aria-label', t('lang.otherAria'));
  }
  fillRegions();
}
function fillRegions() {
  const sel = $('#f-province');
  const keep = sel.value;
  const o = regionOptions(lang);
  const opt = (x) => `<option value="${esc(x.value)}">${esc(x.name)}</option>`;
  sel.innerHTML = `<option value="">${esc(t('sheet.choose'))}</option>
    <optgroup label="${esc(t('region.canada'))}">${o.canada.map(opt).join('')}</optgroup>
    <optgroup label="${esc(t('region.us'))}">${o.us.map(opt).join('')}</optgroup>
    <optgroup label="${esc(t('region.other'))}">${opt(o.elsewhere)}</optgroup>`;
  sel.value = keep;
}
function switchLang() {
  lang = lang === 'fr' ? 'en' : 'fr';
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage blocked */ }
  applyStatic();
  if (!$('#search-msg').hidden) showSearchMsg(normalizeVin(input.value));
  if (current.report) { renderReport(); document.title = title(current.name); } else if (!current.vin) { renderHome(); document.title = title(); }
}
const title = (name) => (name ? `${name} · ${t('app.title')}` : t('app.title'));

// ---------- Formatting ----------
const words = (s) => String(s ?? '').toLowerCase().replace(/[a-z0-9]+/g, (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));
const sentence = (s) => { const x = words(s).trim(); return x ? x[0].toUpperCase() + x.slice(1) : ''; };
const titleCase = (s) => words(s).replace(/(^|[\s(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
const makeName = (m) => (!m ? '' : m.length <= 3 ? m.toUpperCase() : titleCase(m));
const component = (c) => String(c ?? '').split(':').map((p) => sentence(p)).filter(Boolean).join(' › ');
const num = (n) => fmtNumber(n, lang);
const compact = (n) => fmtNumber(n, lang, { notation: 'compact', maximumFractionDigits: 1 });
const date = (d) => fmtDate(d, lang);
const money = (c) => fmtMoney(c, lang);
const distance = (value, unit) => fmtDistance(value, unit, lang);
const reading = (r) => fmtReading(r, lang);

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
const pad = (n) => String(n).padStart(2, '0');
function nhtsaDate(s) { const p = parseNhtsaDate(s); return p ? date(`${p.y}-${pad(p.m)}-${pad(p.d)}`) : String(s ?? ''); }
const nhtsaTime = (s) => { const p = parseNhtsaDate(s); return p ? Date.UTC(p.y, p.m - 1, p.d) : 0; };
const newestFirst = (a, b) => nhtsaTime(b.date) - nhtsaTime(a.date);

const vehicleName = (v) => [v.year, makeName(v.make), v.model, v.trim].filter(Boolean).join(' ');
const ymm = (v) => [makeName(v.make), v.model, v.year].filter(Boolean).join(' ');
// NHTSA's drive, body and fuel names, in the page's language when they're common ones.
function driveText(d) {
  if (!d) return '';
  const s = String(d).toLowerCase();
  const k = /awd|all[- ]wheel/.test(s) ? 'awd' : /4wd|4x4|four[- ]wheel|4-wheel/.test(s) ? '4wd' : /rwd|rear[- ]wheel/.test(s) ? 'rwd' : /fwd|front[- ]wheel/.test(s) ? 'fwd' : null;
  if (k) return t(`drive.${k}`);
  const parts = String(d).split('/');
  return sentence(parts[1] ?? parts[0]);
}
const BODIES = [[/sport utility|\bsuv\b/, 'suv'], [/crossover|\bcuv\b/, 'cuv'], [/minivan/, 'minivan'], [/\bvan\b/, 'van'], [/pickup/, 'pickup'],
  [/\btruck\b/, 'truck'], [/\bbus\b/, 'bus'], [/motorcycle/, 'motorcycle'], [/sedan|saloon/, 'sedan'], [/coupe/, 'coupe'],
  [/convertible|cabriolet/, 'convertible'], [/hatchback|liftback/, 'hatchback'], [/wagon/, 'wagon']];
function bodyText(b) {
  if (!b) return '';
  const k = BODIES.find(([re]) => re.test(String(b).toLowerCase()))?.[1];
  return k ? t(`body.${k}`) : sentence(String(b).split('/')[0]);
}
const FUELS = [[/flex|ffv/, 'flex'], [/natural gas|cng/, 'cng'], [/propane|lpg/, 'lpg'], [/ethanol|e85/, 'ethanol'],
  [/hydrogen/, 'hydrogen'], [/electric/, 'electric'], [/diesel/, 'diesel'], [/gasoline/, 'gasoline']];
function fuelText(f) {
  if (!f) return '';
  const k = FUELS.find(([re]) => re.test(String(f).toLowerCase()))?.[1];
  return k ? t(`fuel.${k}`) : sentence(f);
}
function engineText(v) {
  const cyl = Number(v.engineCylinders), cfg = String(v.engineConfig ?? '');
  const layout = !cyl ? '' : /^v/i.test(cfg) ? `V${cyl}` : /in-?line/i.test(cfg) ? t('engine.inline', { n: cyl }) : /flat|horizontal|opposed/i.test(cfg) ? t('engine.flat', { n: cyl }) : t('engine.cyl', { n: cyl });
  const disp = Number(v.displacementL) ? `${fmtNumber(Number(v.displacementL), lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L` : '';
  const hp = Number(v.engineHp) ? t('engine.hp', { n: Math.round(Number(v.engineHp)) }) : '';
  return [disp && layout ? `${disp} ${layout}` : disp || layout, /^yes/i.test(v.turbo ?? '') ? t('engine.turbo') : '', hp].filter(Boolean).join(' · ');
}
function gvwrText(g) {
  const m = String(g).match(/^Class\s+([^:]+):\s*(.+?)\s*\((.+?)\)\s*$/i);
  if (!m) return String(g);
  const range = m[3].replace(/\s*-\s*/, '–').replace(/\d[\d,]*/g, (x) => num(Number(x.replace(/,/g, ''))));
  return `${range} · ${t('gvwr.class')} ${m[1]}`;
}
function builtText(v) {
  const country = v.plantCountry ? titleCase(v.plantCountry).replace(/\s*\((USA|US)\)$/i, '') : '';
  return [v.plantCity && titleCase(v.plantCity), v.plantState && titleCase(v.plantState), country].filter(Boolean).join(', ');
}
function vinProblems(vin) {
  const out = [];
  if (vin.length !== 17) out.push(t('vin.length', { n: vin.length }));
  if (/[IOQ]/.test(vin)) out.push(t('vin.ioq'));
  if (/[^A-Z0-9]/.test(vin)) out.push(t('vin.chars'));
  if (!out.length) out.push(t('vin.check'));
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
      setTimeout(() => toast(problem === 'unreadable' ? t('store.unreadable') : t('store.dropped', { n: dropped }), { long: true }));
    }
    storeCache = { raw, json: JSON.stringify(data), problem };
  }
  return JSON.parse(storeCache.json);
}
// Returns null when saved, or a message saying why not.
function saveStore(d) {
  if (storeCache.problem === 'newer') return t('store.newer');
  try {
    localStorage.setItem(STORE, JSON.stringify(d));
    return null;
  } catch (e) {
    return e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ? t('store.full') : t('store.blocked');
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
// patch sets other vehicle fields at the same time, such as its odometer unit.
function setRecords(vin, records, patch = {}) {
  const d = loadStore();
  const name = vin === current.vin && current.name ? current.name : undefined;
  d.vehicles[vin] = { name: '', ...d.vehicles[vin], ...patch, records, ...(name && { name }) };
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
// The unit a vehicle's chart and new readings use: the owner's last choice, else the unit of
// its latest reading, else km.
function unitFor(vin, records = recordsFor(vin)) {
  const saved = loadStore().vehicles[vin]?.unit;
  if (saved) return saved;
  return summarize(records).latestReading?.unit ?? 'km';
}

// ---------- Small UI helpers ----------
let toastTimer;
// action: { label, run } adds a button, such as Undo, and keeps the toast up for 8 seconds.
function toast(msg, { long = false, action = null } = {}) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('has-action', Boolean(action));
  if (action) {
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-btn', textContent: action.label });
    btn.addEventListener('click', () => { clearTimeout(toastTimer); el.classList.remove('show', 'has-action'); btn.remove(); action.run(); }, { once: true });
    el.append(btn);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show', 'has-action'); el.querySelector('.toast-btn')?.remove(); }, action ? 8000 : long ? 7000 : 2600);
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
  el.innerHTML = `${icon('alert')}<span>${esc(vinProblems(vin).join(' '))}</span>${checkDigitOnly ? `<button type="button" class="link-btn" data-force>${esc(t('search.anyway'))}</button>` : ''}`;
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
      <span class="vehicle-text"><b><bdi>${esc(v.name || t('home.vehicle'))}</bdi></b><span class="mono">${esc(v.vin)}</span></span>
      <span class="vehicle-aside">${v.records ? esc(t('home.records', { n: v.records })) : ''}</span>${icon('chevron-right')}
    </button></li>`).join('');
}
function showHome() {
  lookupSeq++;
  current = { vin: null, name: '', report: null, example: false };
  chart = null;
  showView('home');
  renderHome();
  document.title = title();
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
    report = await buildReport(vin, { include: { recallsCanada: false }, force, lang });
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
  document.title = title(current.name);
  renderReport();
}

function skeleton() {
  const bar = (w, h, r = '.5rem') => `<div class="sk" style="width:${w};height:${h};border-radius:${r}"></div>`;
  return `<div class="sk-stack" aria-busy="true" aria-label="${esc(t('report.loading'))}">
    ${bar('34%', '14px')}${bar('72%', '38px')}
    <div class="sk-row">${bar('5.5rem', '28px', '999px')}${bar('7rem', '28px', '999px')}${bar('5rem', '28px', '999px')}</div>
    ${bar('100%', '56px')}
    <div class="tiles">${bar('100%', '116px', '14px').repeat(4)}</div>
    ${bar('100%', '240px', '18px')}
    <p class="fine">${esc(t('report.contacting'))}</p>
  </div>`;
}
function failedPanel(msg) {
  return `<section class="panel"><header class="panel-head"><span class="panel-icon">${icon('alert')}</span><h2>${esc(t('report.failedTitle'))}</h2></header>
    <p class="empty-line info">${icon('info')}<span>${esc(t('report.failedText', { msg }))}</span></p>
    <p class="gap-top"><button type="button" class="btn primary" data-retry>${icon('refresh')}${esc(t('common.tryAgain'))}</button></p></section>`;
}

// ---------- Report ----------
function panel(id, ic, heading, aside, body) {
  return `<section class="panel" id="${id}"><header class="panel-head"><span class="panel-icon">${icon(ic)}</span><h2>${esc(heading)}</h2>${aside ? `<span class="panel-aside">${esc(aside)}</span>` : ''}</header>${body}</section>`;
}
// What went wrong, in words a person can act on. Kinds come from errorKind() in src/http.js.
const PROBLEM_KINDS = ['unreachable', 'timeout', 'unavailable', 'refused', 'format'];
const problem = (kind) => t(PROBLEM_KINDS.includes(kind) ? `problem.${kind}` : 'problem.other');
const loadError = (kind) => `<p class="load-error">${icon('alert')}<span>${esc(problem(kind))}</span><button type="button" class="link-btn" data-retry>${esc(t('common.tryAgain'))}</button></p>`;

function renderReport() {
  const r = current.report;
  const v = r.vehicle;
  if (!v?.make) {
    const kind = r.errorKinds?.vehicle ?? 'unrecognized';
    // Only an answer without a make means the VIN is unknown. Any other failure is NHTSA's,
    // and the VIN shouldn't be blamed for it.
    $('#report').innerHTML = (kind === 'unrecognized'
      ? panel('decode', 'alert', t('decode.title'), '',
        `<p class="empty-line info">${icon('info')}<span>${esc(t('decode.text', { vin: r.vin }))}</span></p>`)
      : panel('decode', 'alert', t('report.failedTitle'), '',
        `<p class="empty-line info">${icon('info')}<span>${esc(problem(kind))}${r.vinCheck?.valid ? ` ${esc(t('decode.vinOk'))}` : ''}</span></p>
        <p class="gap-top"><button type="button" class="btn primary" data-retry>${icon('refresh')}${esc(t('common.tryAgain'))}</button></p>`))
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
  const chips = [bodyText(v.bodyClass), driveText(v.driveType), fuelText(v.fuelType)].filter(Boolean);
  const specs = [
    [t('spec.engine'), engineText(v)],
    [t('spec.transmission'), v.transmission && sentence(v.transmission)],
    [t('spec.weight'), v.gvwr && gvwrText(v.gvwr)],
    [t('spec.built'), builtText(v)],
    [t('spec.series'), v.series],
  ].filter(([, x]) => x);
  const warnings = v.decodeWarnings ?? [];
  return `<header class="identity">
    <p class="eyebrow">${esc([v.year, makeName(v.make)].filter(Boolean).join(' · '))}</p>
    <h1>${esc([v.model, v.trim].filter(Boolean).join(' ') || makeName(v.make))}</h1>
    <div class="chips">${current.example ? `<span class="chip example">${icon('info')}${esc(t('chip.example'))}</span>` : ''}${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    ${vinStrip(r.vin, v, r.vinCheck)}
    ${specs.length ? `<dl class="specs">${specs.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>` : ''}
    ${warnings.length ? `<p class="fine decode-note">${icon('info')}<span>${esc(warnings.join(' '))}</span></p>` : ''}
  </header>`;
}

// The 17 positions of a North American VIN, grouped the way the standard defines them.
function vinStrip(vin, v, check) {
  if (vin.length !== 17) return '';
  const segs = [
    [0, 3, t('seg.maker'), t('seg.makerTip')],
    [3, 8, t('seg.model'), t('seg.modelTip')],
    [8, 9, t('seg.check'), check.valid ? t('seg.checkOk') : t('seg.checkBad')],
    [9, 10, v.year ? String(v.year) : t('seg.year'), t('seg.yearTip')],
    [10, 11, t('seg.plant'), v.plantCity ? t('seg.plantTipCity', { city: titleCase(v.plantCity) }) : t('seg.plantTip')],
    [11, 17, t('seg.serial'), t('seg.serialTip')],
  ];
  return `<div class="vin" role="group" aria-label="${esc(t('seg.aria', { vin }))}">${segs.map(([a, b, cap, tip], i) => `<div class="seg${i === 2 ? (check.valid ? ' ok' : ' bad') : ''}" title="${esc(tip)}"><b>${esc(vin.slice(a, b))}</b><span>${esc(cap)}</span></div>`).join('')}</div>`;
}

const likelyRecalls = (r) => (r.recallsUS ?? []).filter((x) => !x.mismatch?.length);

function alertBanner(r) {
  const likely = likelyRecalls(r);
  const park = likely.filter((x) => x.parkIt);
  const outside = likely.filter((x) => x.parkOutside && !x.parkIt);
  if (!park.length && !outside.length) return '';
  const text = park.length ? t('alert.parkText', { n: park.length }) : t('alert.outsideText', { n: outside.length });
  return `<div class="alert" role="alert">${icon('alert')}<div><strong>${esc(park.length ? t('alert.doNotDrive') : t('alert.parkOutside'))}</strong><p>${esc(text)} ${esc(t('alert.askDealer'))}</p></div></div>`;
}

function renderTiles() {
  const el = $('#tiles');
  if (!el || !current.report) return;
  const r = current.report;
  const tile = (target, ic, label, value, sub) => `<a class="tile" href="#${target}"><span class="tile-label">${icon(ic)}${esc(label)}</span><span class="tile-value">${value}</span>${sub}</a>`;
  const sub = (text) => `<span class="tile-sub">${esc(text)}</span>`;

  const likely = likelyRecalls(r);
  const recalls = r.errors.recallsUS
    ? tile('recalls', 'shield', t('tile.recalls'), '–', sub(t('tile.couldntLoad')))
    : tile('recalls', 'shield', t('tile.recalls'), num(likely.length),
      likely.some((x) => x.parkIt) ? pill('crit', 'alert', t('alert.doNotDrive')) : likely.length ? pill('warn', 'alert', t('pill.askDealer')) : pill('good', 'check', t('pill.noneFound')));

  const recs = recordsFor(current.vin);
  const s = summarize(recs, { today: localDate(), lang });
  const latest = s.latestReading;
  const records = tile('records', 'gauge', t('tile.records'), num(recs.length),
    !recs.length ? sub(t('tile.startLog')) : s.odometerIssues.length ? pill('crit', 'alert', t('pill.odoCheck')) : sub(latest ? distance(latest.value, latest.unit) : t('records.services', { n: s.serviceCount })));

  const c = r.complaints;
  const complaints = tile('complaints', 'chat', t('tile.complaints'), c ? num(c.total) : '–',
    c ? sub(`${t('tile.crashes', { n: c.crashes })} · ${t('tile.fires', { n: c.fires })}`) : sub(r.errors.complaints ? t('tile.couldntLoad') : ''));

  const overall = (r.safetyRatings ?? []).map((x) => Number(x.overall)).filter((n) => n >= 1 && n <= 5);
  const lo = Math.min(...overall), hi = Math.max(...overall);
  const ratings = tile('ratings', 'star', t('tile.rating'), overall.length ? `${lo === hi ? lo : `${lo}–${hi}`}<small>/5</small>` : '–',
    sub(overall.length ? (r.safetyRatings.length > 1 ? t('tile.versions', { n: r.safetyRatings.length }) : t('tile.overall')) : r.errors.safetyRatings ? t('tile.couldntLoad') : r.safetyRatings?.length ? t('tile.noOverall') : t('tile.notTested')));

  el.innerHTML = recalls + records + complaints + ratings;
}

function recallItem(x) {
  const flags = [x.parkIt && pill('crit', 'alert', t('alert.doNotDrive')), x.parkOutside && pill('crit', 'alert', t('alert.parkOutside'))].filter(Boolean).join('');
  const long = String(x.summary ?? '').length > 220;
  // Reasons are worked out again here so they follow the page's language.
  const reasons = x.mismatch?.length ? recallMismatch(x, current.report.vehicle, { lang }) : [];
  return `<article class="recall">
    ${flags ? `<div class="flags">${flags}</div>` : ''}
    <h3>${esc(component(x.component) || t('recall.title'))}</h3>
    <p class="recall-meta">${esc(nhtsaDate(x.date))} · NHTSA <span class="mono">${esc(x.campaign)}</span></p>
    ${reasons.map((m) => `<p class="why">${icon('info')}<span>${esc(t('recall.notThis'))} ${esc(m)}</span></p>`).join('')}
    ${x.summary ? `<p class="recall-summary${long ? ' clamp' : ''}" lang="en">${esc(x.summary)}</p>${long ? `<button type="button" class="link-btn" data-more>${esc(t('recall.more'))}</button>` : ''}` : ''}
    ${x.consequence || x.remedy ? `<details class="more-details"><summary>${esc(t('recall.riskRemedy'))}</summary>${x.consequence ? `<p><b>${esc(t('recall.risk'))}</b> <span lang="en">${esc(x.consequence)}</span></p>` : ''}${x.remedy ? `<p><b>${esc(t('recall.remedy'))}</b> <span lang="en">${esc(x.remedy)}</span></p>` : ''}</details>` : ''}
  </article>`;
}

function recallsPanel(r) {
  const v = r.vehicle;
  let body;
  let aside = '';
  if (r.errors.recallsUS) body = loadError(r.errorKinds?.recallsUS);
  else if (!r.recallsUS?.length) body = `<p class="empty-line">${icon('check')}<span>${esc(t('recalls.none', { model: ymm(v) }))}</span></p>`;
  else {
    const likely = likelyRecalls(r).sort(newestFirst);
    const others = r.recallsUS.filter((x) => x.mismatch?.length).sort(newestFirst);
    aside = t('recalls.aside', { n: likely.length, total: r.recallsUS.length });
    body = likely.length
      ? `<div>${likely.map(recallItem).join('')}</div>`
      : `<p class="empty-line">${icon('check')}<span>${esc(t('recalls.noneMatch', { n: r.recallsUS.length }))}</span></p>`;
    if (others.length) {
      body += `<details class="others"><summary><span>${esc(t('recalls.others', { n: others.length }))}</span>${icon('chevron')}</summary><div>${others.map(recallItem).join('')}</div></details>`;
    }
    body += `<p class="fine gap-top">${esc(t('recalls.matchedPre'))} <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">nhtsa.gov/recalls</a> ${esc(t('recalls.matchedPost'))}</p>`;
  }
  body += `<div class="subpanel">
    <div class="subpanel-head"><strong>${esc(t('recalls.canada'))}</strong><span class="chip">${esc(ymm(v))}</span></div>
    <p>${esc(t('recalls.tcText'))}</p>
    <a class="btn secondary small" href="${TC_RECALLS}" target="_blank" rel="noopener">${esc(t('recalls.tcOpen'))}${icon('external')}</a>
  </div>`;
  return panel('recalls', 'shield', t('recalls.title'), aside, body);
}

function complaintsPanel(r) {
  const c = r.complaints;
  let body;
  if (r.errors.complaints) body = loadError(r.errorKinds?.complaints);
  else if (!c) body = '';
  else if (!c.total) body = `<p class="empty-line">${icon('check')}<span>${esc(t('complaints.none'))}</span></p>`;
  else {
    const top = c.topComponents.slice(0, 6);
    const max = Math.max(...top.map((x) => x.count), 1);
    body = `<div class="figures">${[['complaints.crashes', c.crashes], ['complaints.fires', c.fires], ['complaints.injuries', c.injuries], ['complaints.deaths', c.deaths]].map(([k, n]) => `<div class="figure"><b>${num(n)}</b><span>${esc(t(k))}</span></div>`).join('')}</div>
      <h3 class="minor">${esc(t('complaints.top'))}</h3>
      <ol class="bars" lang="en">${top.map((x) => `<li><span class="bar-label">${esc(component(x.component))}</span><span class="bar-row"><span class="bar" style="--p:${(x.count / max).toFixed(4)}"></span><span class="bar-val">${num(x.count)}</span></span></li>`).join('')}</ol>
      <p class="fine gap-top">${esc(t('complaints.note'))}</p>`;
  }
  return panel('complaints', 'chat', t('complaints.title'), c && !r.errors.complaints ? t('complaints.filed', { n: c.total }) : '', body);
}

function stars(val) {
  const n = Number(val);
  if (!(n >= 1 && n <= 5)) return `<span class="na">${esc(t('ratings.notRated'))}</span>`;
  return `<span class="stars" role="img" aria-label="${esc(t('ratings.stars', { n }))}">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= n ? 'on' : 'off')).join('')}</span>`;
}
function ratingsPanel(r) {
  const list = r.safetyRatings;
  let body;
  if (r.errors.safetyRatings) body = loadError(r.errorKinds?.safetyRatings);
  else if (!list?.length) body = `<p class="empty-line info">${icon('info')}<span>${esc(t('ratings.none'))}</span></p>`;
  else body = list.map((x) => `<div class="rating"><p class="rating-name" lang="en">${esc(x.description)}</p><dl class="stars-list">${[['ratings.overall', x.overall], ['ratings.frontal', x.frontCrash], ['ratings.side', x.sideCrash], ['ratings.rollover', x.rollover]].map(([k, val]) => `<div><dt>${esc(t(k))}</dt><dd>${stars(val)}</dd></div>`).join('')}</dl></div>`).join('');
  return panel('ratings', 'star', t('ratings.title'), '', body);
}

// ---------- My records ----------
const TYPE_ICON = { service: 'wrench', mileage: 'gauge', registration: 'plate' };

// Chart points in the vehicle's unit. Each keeps its reading as entered for the tooltip.
function readings(records, unit) {
  const flagged = new Set(summarize(records).odometerIssues.map((i) => i.record.id));
  return records.filter((r) => readingOf(r))
    .map((r) => {
      const x = readingOf(r);
      return { id: r.id, t: Date.parse(`${r.date}T12:00:00`), value: convert(x.value, x.unit, unit), label: reading(r), date: r.date, flag: flagged.has(r.id) };
    })
    .sort((a, b) => a.t - b.t || a.value - b.value);
}
function perYear(pts) {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const days = (b.t - a.t) / 864e5;
  if (days < 60 || b.value <= a.value) return null;
  return Math.round(((b.value - a.value) / days) * 365.25 / 100) * 100;
}

function entryItem(r, flagged) {
  let heading;
  const meta = [];
  if (r.type === 'service') {
    heading = r.work || t('typeLong.service');
    if (readingOf(r)) meta.push(reading(r));
    if (r.shop) meta.push(r.shop);
    if (typeof r.costCents === 'number') meta.push(money(r.costCents));
  } else if (r.type === 'mileage') {
    heading = reading(r);
  } else {
    heading = r.province ? t('entry.regTitle', { region: regionName(r.province, lang) }) : t('typeLong.registration');
    if (r.plate) meta.push(t('entry.plate', { plate: r.plate }));
    if (r.expiry) meta.push(t('entry.expires', { date: date(r.expiry) }));
    if (readingOf(r)) meta.push(reading(r));
  }
  const confirming = pendingDelete === r.id;
  return `<li class="entry t-${esc(r.type)}">
    <span class="node">${icon(TYPE_ICON[r.type] ?? 'info')}</span>
    <div class="entry-body">
      <p class="entry-head"><span>${esc(t(`type.${r.type}`))}</span><time datetime="${esc(r.date)}">${esc(date(r.date))}</time></p>
      <p class="entry-title" dir="auto">${esc(heading)}</p>
      ${meta.length ? `<p class="entry-meta">${meta.map((m) => `<bdi>${esc(m)}</bdi>`).join(' · ')}</p>` : ''}
      ${flagged ? pill('crit', 'alert', t('entry.lower')) : ''}
      ${r.notes ? `<p class="entry-notes" dir="auto">${esc(r.notes)}</p>` : ''}
    </div>
    <button type="button" class="icon-btn del${confirming ? ' confirm' : ''}" data-del="${esc(r.id)}" aria-label="${esc(t('entry.delete'))}">${confirming ? esc(t('entry.confirm')) : icon('trash')}</button>
  </li>`;
}

function renderRecords() {
  const el = $('#records');
  if (!el || !current.vin) return;
  const recs = recordsFor(current.vin);
  const head = `<header class="panel-head"><span class="panel-icon">${icon('gauge')}</span><h2>${esc(t('records.title'))}</h2><button type="button" class="btn primary small" data-add>${icon('plus')}${esc(t('common.add'))}</button></header>`;
  const store = loadStore();
  const when = (ms) => date(localDate(new Date(ms)));
  const backup = !recs.length ? ''
    : !store.lastBackupAt ? ` <b>${esc(t('records.noBackup'))}</b>`
    : (store.lastChangeAt ?? 0) > store.lastBackupAt ? ` <b>${esc(t('records.changed', { date: when(store.lastBackupAt) }))}</b>`
    : ` ${esc(t('records.lastBackup', { date: when(store.lastBackupAt) }))}`;
  const privacy = `<p class="fine gap-top${backup.includes('<b>') ? ' remind' : ''}">${esc(t('records.privacy'))}${backup}</p>`;
  const forget = store.vehicles[current.vin] ? `<button type="button" class="btn ghost small" data-act="forget">${icon('trash')}${esc(t('records.forget'))}</button>` : '';
  if (!recs.length) {
    el.innerHTML = `${head}<div class="records-empty">
        <h3>${esc(t('records.emptyTitle'))}</h3>
        <p>${esc(t('records.emptyText'))}</p>
        <button type="button" class="btn primary" data-add>${icon('plus')}${esc(t('records.addFirst'))}</button>
      </div>
      <div class="tools"><button type="button" class="btn ghost small" data-act="restore">${icon('upload')}${esc(t('records.restoreBackup'))}</button>${forget}</div>${privacy}`;
    chart = null;
    renderTiles();
    return;
  }
  const s = summarize(recs, { today: localDate(), lang });
  const unit = unitFor(current.vin, recs);
  const pts = readings(recs, unit);
  const flagged = new Set(s.odometerIssues.map((i) => i.record.id));
  const rate = perYear(pts);

  let cluster = '';
  if (s.latestReading) {
    const { value, unit: shown } = s.latestReading;
    const digitsOnly = String(Math.round(value));
    const digits = digitsOnly.padStart(6, '0');
    const lead = digits.length - digitsOnly.length;
    cluster = `<div class="cluster">
      <span class="cluster-label">${esc(t('records.odometer'))}</span>
      <div class="drum" role="img" aria-label="${esc(distance(value, shown))}">${[...digits].map((d, i) => `<span class="d${i < lead ? ' off' : ''}">${d}</span>`).join('')}<span class="unit">${esc(shown)}</span></div>
      <span class="cluster-meta">${esc(t('records.read', { date: date(s.latestReading.date) }))}${rate ? ` · ${esc(t('records.rate', { distance: distance(rate, unit) }))}` : ''}</span>
    </div>`;
  }

  const pills = [];
  if (s.registrationStatus === 'expired') pills.push(pill('crit', 'alert', t('records.regExpired', { date: date(s.latestRegistration.expiry) })));
  else if (s.registrationStatus === 'expiring') pills.push(pill('warn', 'alert', t('records.regExpiring', { date: date(s.latestRegistration.expiry) })));
  else if (s.registrationStatus === 'valid') pills.push(pill('good', 'check', t('records.regValid', { date: date(s.latestRegistration.expiry) })));
  if (s.serviceCount) pills.push(pill('neutral', 'wrench', `${t('records.services', { n: s.serviceCount })}${s.serviceCostCents ? ` · ${money(s.serviceCostCents)}` : ''}`));
  if (s.odometerIssues.length) pills.push(pill('crit', 'alert', t('records.odoIssues', { n: s.odometerIssues.length })));
  else if (pts.length >= 2) pills.push(pill('good', 'check', t('records.odoOk')));

  const chartBlock = pts.length >= 2
    ? `<figure class="chart"><figcaption><span>${esc(t('records.chart'))}</span><span>${num(pts.length)}</span></figcaption><div class="chart-box" id="chart-box" tabindex="0" aria-label="${esc(t('records.chartAria'))}"></div></figure>`
    : pts.length === 1 ? `<p class="fine gap-top">${esc(t('records.oneReading'))}</p>` : '';

  el.innerHTML = `${head}${cluster}
    ${pills.length ? `<div class="status-row">${pills.join('')}</div>` : ''}
    ${chartBlock}
    <ol class="timeline">${sortRecords(recs).map((r) => entryItem(r, flagged.has(r.id))).join('')}</ol>
    <div class="tools">
      <button type="button" class="btn secondary small" data-act="copy">${icon('copy')}${esc(t('records.copy'))}</button>
      <button type="button" class="btn secondary small" data-act="backup">${icon('download')}${esc(t('records.backup'))}</button>
      <button type="button" class="btn secondary small" data-act="csv">${icon('doc')}${esc(t('records.csv'))}</button>
      <button type="button" class="btn ghost small" data-act="restore">${icon('upload')}${esc(t('records.restore'))}</button>
      ${forget}
    </div>${privacy}`;
  renderTiles();
  bindChart(pts, unit);
}

// ---------- Mileage chart ----------
const niceStep = (raw) => { const p = 10 ** Math.floor(Math.log10(raw)); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const resizer = 'ResizeObserver' in window ? new ResizeObserver(() => requestAnimationFrame(drawChart)) : null;

function bindChart(pts, unit) {
  const box = $('#chart-box');
  resizer?.disconnect();
  if (!box) { chart = null; return; }
  chart = { pts, unit, idx: -1 };
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
  const { pts, unit } = chart;
  const W = Math.max(200, Math.floor(box.clientWidth)), H = 210;
  const m = { l: 40, r: 12, t: 30, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  let t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const padT = Math.max((t1 - t0) * 0.05, 864e5 * 12);
  t0 -= padT; t1 += padT;
  const maxValue = Math.max(...pts.map((p) => p.value), 1);
  const step = niceStep(Math.max(maxValue / 4, 1));
  const yMax = Math.ceil(maxValue / step) * step;
  const X = (x) => m.l + ((x - t0) / (t1 - t0)) * iw;
  const Y = (v) => m.t + ih - (v / yMax) * ih;
  Object.assign(chart, { X, Y, W, idx: -1 });

  let grid = '', yLabels = '', xLabels = '';
  for (let v = 0; v <= yMax + 1e-6; v += step) {
    const y = Math.round(Y(v)) + 0.5;
    grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
    yLabels += `<text x="${m.l - 8}" y="${y + 4}" text-anchor="end">${v ? esc(compact(v)) : '0'}</text>`;
  }
  const years = [];
  for (let yr = new Date(t0).getFullYear(); yr <= new Date(t1).getFullYear() + 1; yr++) {
    const x = new Date(yr, 0, 1).getTime();
    if (x >= t0 && x <= t1) years.push([x, String(yr)]);
  }
  const ticks = years.length >= 2
    ? years.filter((_, i, a) => a.length <= 6 || i % 2 === 0)
    : [[pts[0].t, fmtMonthYear(pts[0].date, lang)], [pts[pts.length - 1].t, fmtMonthYear(pts[pts.length - 1].date, lang)]];
  ticks.forEach(([x, label], i) => {
    const px = X(x);
    const anchor = years.length >= 2 ? (px < m.l + 18 ? 'start' : px > W - m.r - 18 ? 'end' : 'middle') : (i === 0 ? 'start' : 'end');
    xLabels += `<text x="${px.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(label)}</text>`;
  });

  const xy = pts.map((p) => [X(p.t).toFixed(1), Y(p.value).toFixed(1)]);
  const line = `M${xy.map((q) => q.join(',')).join('L')}`;
  const area = `${line}L${xy[xy.length - 1][0]},${Y(0)}L${xy[0][0]},${Y(0)}Z`;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const lx = X(last.t), ly = Y(last.value);
  const labelY = Y(prev.value) >= ly ? ly - 11 : ly + 20;
  const dots = pts.map((p, i) => `<circle class="pt${p.flag ? ' flag' : ''}" cx="${xy[i][0]}" cy="${xy[i][1]}" r="${i === pts.length - 1 ? 5 : 4}"/>`).join('');

  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <g class="grid">${grid}</g>
      <g class="axis">${yLabels}${xLabels}</g>
      <path class="area" d="${area}"/>
      <path class="line" d="${line}"/>
      <line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
      ${dots}
      <circle class="hl" r="6.5" cx="0" cy="0" visibility="hidden"/>
      <text class="end-label" x="${(lx + 5).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="end">${esc(distance(last.value, unit))}</text>
    </svg><div class="tip" hidden><b></b><span></span></div>`;
}

function showPoint(i) {
  const box = $('#chart-box');
  if (!box || !chart?.X) return;
  const p = chart.pts[i];
  chart.idx = i;
  const x = chart.X(p.t), y = chart.Y(p.value);
  const xh = box.querySelector('.xhair'), hl = box.querySelector('.hl'), tip = box.querySelector('.tip');
  xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
  hl.setAttribute('cx', x); hl.setAttribute('cy', y); hl.setAttribute('visibility', 'visible'); hl.classList.toggle('flag', p.flag);
  tip.querySelector('b').textContent = p.label;
  tip.querySelector('span').textContent = date(p.date) + (p.flag ? ` · ${t('chart.lower')}` : '');
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
  $('#odo-optional').hidden = type === 'mileage';
}
function openSheet() {
  form.reset();
  const today = localDate();
  form.elements.date.value = today;
  form.elements.date.max = today;
  form.elements.unit.value = unitFor(current.vin);
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
  const { record, errors } = makeRecord(Object.fromEntries(new FormData(form)), { today: localDate(), lang });
  if (errors.length) { err.textContent = errors.join(' '); err.hidden = false; return; }
  // A reading also sets the vehicle's unit, so the next one starts in the same unit.
  const x = readingOf(record);
  const problem = setRecords(current.vin, [...recordsFor(current.vin), record], x ? { unit: x.unit } : {});
  if (problem) {
    err.textContent = problem;
    err.hidden = false;
    return;
  }
  closeSheet();
  renderRecords();
  toast(t('toast.saved'));
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
  const { url, errors } = feedbackUrl({ kind: f.kind.value, message: f.message.value, vin }, { lang });
  if (errors.length) { err.textContent = errors.join(' '); err.hidden = false; return; }
  window.open(url, '_blank', 'noopener');
  closeFeedback();
  fbForm.reset();
  toast(t('fb.opened'));
});

// ---------- Copy, backup, restore ----------
async function copyHistory() {
  const text = historyText(current.vin, current.name, recordsFor(current.vin), { lang });
  try { await navigator.clipboard.writeText(text); toast(t('toast.copied')); return; } catch { /* fall back below */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand?.('copy');
  ta.remove();
  toast(ok ? t('toast.copied') : t('toast.copyFailed'));
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
  toast(t('toast.backup'));
}
function exportCsv() {
  download(`vin-report-${current.vin}-${localDate()}.csv`, recordsCsv(recordsFor(current.vin), { lang }), 'text/csv');
  toast(t('toast.csv'));
}
function forgetVehicle() {
  const n = recordsFor(current.vin).length;
  if (!confirm(n ? t('confirm.forgetRecords', { n }) : t('confirm.forget'))) return;
  const d = loadStore();
  delete d.vehicles[current.vin];
  const problem = saveStore(d);
  if (problem) { toast(problem, { long: true }); return; }
  history.pushState({}, '', location.pathname);
  showHome();
  toast(t('toast.removed'));
}
function eraseAll() {
  if (!confirm(t('confirm.erase'))) return;
  try {
    for (const key of Object.keys(localStorage)) if (key === STORE || key.startsWith(`${STORE}:`)) localStorage.removeItem(key);
  } catch { /* storage blocked: nothing saved */ }
  if (current.vin) renderRecords(); else renderHome();
  toast(t('toast.erased'));
}
async function restoreBackup(file) {
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error(t('backup.tooBig'));
    const { vehicles, skipped } = parseBackup(await file.text(), { lang });
    const d = loadStore();
    let n = 0;
    for (const [vin, v] of Object.entries(vehicles)) {
      const prev = d.vehicles[vin] ?? { name: v.name, records: [] };
      d.vehicles[vin] = { ...prev, name: prev.name || v.name, records: mergeRecords(prev.records ?? [], v.records), ...(!prev.unit && v.unit && { unit: v.unit }) };
      n += v.records.length;
    }
    const problem = saveStore(d);
    if (problem) throw new Error(problem);
    renderRecords();
    if (!current.vin) renderHome();
    toast([t('toast.restored', { n }), skipped ? t('toast.skipped', { n: skipped }) : ''].filter(Boolean).join(' '), { long: Boolean(skipped) });
  } catch (e) {
    toast(t('toast.restoreFailed', { msg: e.message }), { long: true });
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
  const el = e.target.closest('button, a');
  if (!el) return;
  if (el.matches('a.tile')) {
    // Scroll without touching the URL, so the report isn't reloaded.
    e.preventDefault();
    document.querySelector(el.getAttribute('href'))?.scrollIntoView();
  } else if (el.matches('[data-example]')) lookup(EXAMPLE_VIN, { example: true });
  else if (el.matches('[data-lang-toggle]')) switchLang();
  else if (el.matches('[data-vin]')) lookup(el.dataset.vin);
  else if (el.matches('[data-force]')) lookup(input.value, { force: true });
  else if (el.matches('[data-retry]')) lookup(current.vin ?? input.value, { push: false, example: current.example, retry: true });
  else if (el.matches('[data-add]')) openSheet();
  else if (el.matches('[data-close]')) (fbSheet.contains(el) ? closeFeedback : closeSheet)();
  else if (el.matches('[data-work]')) { const w = form.elements.work; w.value = w.value ? `${w.value}, ${el.dataset.work}` : el.dataset.work; }
  else if (el.matches('[data-more]')) {
    const clamped = el.previousElementSibling.classList.toggle('clamp');
    el.textContent = clamped ? t('recall.more') : t('recall.less');
  } else if (el.matches('[data-del]')) {
    const id = el.dataset.del;
    if (pendingDelete === id) {
      pendingDelete = null;
      const vin = current.vin;
      const removed = recordsFor(vin).find((r) => r.id === id);
      const problem = setRecords(vin, recordsFor(vin).filter((r) => r.id !== id));
      if (problem) { toast(problem, { long: true }); return; }
      renderRecords();
      toast(t('toast.deleted'), { action: { label: t('common.undo'), run: () => {
        const again = setRecords(vin, mergeRecords(recordsFor(vin), [removed]));
        if (current.vin === vin) renderRecords();
        toast(again ?? t('toast.recordRestored'));
      } } });
    } else {
      // Relabel in place so nothing else on the page is redrawn.
      const reset = (rid) => { const b = document.querySelector(`[data-del="${CSS.escape(rid)}"]`); if (b) { b.classList.remove('confirm'); b.innerHTML = icon('trash'); } };
      if (pendingDelete) reset(pendingDelete);
      pendingDelete = id;
      el.classList.add('confirm');
      el.textContent = t('entry.confirm');
      setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; reset(id); } }, 4000);
    }
  } else if (el.matches('[data-act="copy"]')) copyHistory();
  else if (el.matches('[data-act="backup"]')) saveBackup();
  else if (el.matches('[data-act="restore"]')) $('#restore-file').click();
  else if (el.matches('[data-act="csv"]')) exportCsv();
  else if (el.matches('[data-act="forget"]')) forgetVehicle();
  else if (el.matches('[data-act="erase"]')) eraseAll();
});

function route() {
  const params = new URLSearchParams(location.search);
  const vin = params.get('vin');
  if (vin && current.vin && normalizeVin(vin) === current.vin) return;
  if (vin) lookup(vin, { push: false, example: normalizeVin(vin) === EXAMPLE_VIN, force: params.get('force') === '1' });
  else showHome();
}
initLang();
applyStatic();
route();
