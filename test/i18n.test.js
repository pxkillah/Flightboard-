import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, LANGS, t, pickLang, fmtDate, fmtMonthYear, fmtDistance, fmtMoney } from '../src/i18n.js';
import { regionName, regionOptions, PROVINCES, STATES } from '../src/regions.js';
import { recallMismatch } from '../src/recallMatch.js';
import { feedbackUrl } from '../src/feedback.js';

const placeholders = (m) => [...new Set((typeof m === 'object' ? Object.values(m).join(' ') : m).match(/\{\w+\}/g) ?? [])].sort();

test('every message exists in both languages, with the same placeholders', () => {
  const keys = LANGS.map((l) => Object.keys(MESSAGES[l]).sort());
  assert.deepEqual(keys[0], keys[1]);
  for (const key of keys[0]) {
    const [en, fr] = LANGS.map((l) => MESSAGES[l][key]);
    assert.equal(typeof en, typeof fr, key);
    assert.deepEqual(placeholders(en), placeholders(fr), key);
    for (const m of [en, fr]) {
      const forms = typeof m === 'object' ? Object.values(m) : [m];
      for (const f of forms) assert.ok(f.trim(), `${key} is empty`);
      if (typeof m === 'object') assert.ok(m.one && m.other, `${key} needs one and other`);
    }
  }
});

test('French uses its own plural rule and number format', () => {
  assert.equal(t('fr', 'home.records', { n: 0 }), '0 entrée');
  assert.equal(t('fr', 'home.records', { n: 2 }), '2 entrées');
  assert.equal(t('en', 'home.records', { n: 0 }), '0 records');
  assert.equal(t('en', 'home.records', { n: 1234 }), '1,234 records');
  assert.equal(t('fr', 'home.records', { n: 1234 }), '1 234 entrées');
  assert.equal(t('en', 'no.such.key'), 'no.such.key');
});

test('dates, distances and money for each locale', () => {
  assert.equal(fmtDate('2026-10-15', 'en'), '15 Oct 2026');
  assert.equal(fmtDate('2026-10-15', 'fr'), '15 oct. 2026');
  assert.equal(fmtDate('2026-10-01', 'fr'), '1er oct. 2026');
  assert.equal(fmtDate('2025-13-40', 'fr'), '2025-13-40', 'impossible dates stay as written');
  assert.equal(fmtMonthYear('2026-02-01', 'fr'), 'févr. 2026');
  assert.equal(fmtDistance(75000, 'mi', 'en'), '75,000 mi');
  assert.equal(fmtDistance(75000, 'km', 'fr'), '75 000 km');
  assert.equal(fmtMoney(8999, 'en'), '$89.99');
  assert.equal(fmtMoney(123456, 'fr'), '1 234,56 $');
});

test('the language follows an explicit choice, then the device', () => {
  assert.equal(pickLang({ languages: ['fr-CA', 'en-CA'] }), 'fr');
  assert.equal(pickLang({ languages: ['en-CA', 'fr-CA'] }), 'en');
  assert.equal(pickLang({ languages: ['es-MX', 'fr-FR'] }), 'fr');
  assert.equal(pickLang({ languages: ['de-DE'] }), 'en');
  assert.equal(pickLang({ saved: 'fr', languages: ['en-US'] }), 'fr');
  assert.equal(pickLang({ param: 'en', saved: 'fr', languages: ['fr'] }), 'en');
  assert.equal(pickLang({ param: 'xx', languages: ['fr'] }), 'fr', 'unknown values are ignored');
});

test('regions in both languages', () => {
  assert.equal(regionName('QC', 'fr'), 'Québec');
  assert.equal(regionName('US-NC', 'fr'), 'Caroline du Nord');
  assert.equal(regionName('US-NC'), 'North Carolina');
  assert.equal(regionName('Outside Canada', 'fr'), 'Ailleurs');
  assert.equal(regionName('Mars'), 'Mars', 'unknown values show as typed');
  const o = regionOptions('fr');
  assert.equal(o.canada.length, Object.keys(PROVINCES).length);
  assert.equal(o.us.length, Object.keys(STATES).length);
  assert.equal(o.canada[0].name, 'Alberta');
  assert.ok(o.us.every((x) => x.value.startsWith('US-')));
});

test('recall reasons and feedback errors in French', () => {
  const v = { driveType: 'FWD/Front-Wheel Drive', fuelType: 'Gasoline', displacementL: '2.4' };
  const r = { summary: 'Certain vehicles equipped with all-wheel drive and 3.5L engines may leak.' };
  assert.deepEqual(recallMismatch(r, v, { lang: 'fr' }), [
    'Il vise les véhicules à traction intégrale ou 4 roues motrices; le vôtre est à traction avant.',
    'Il vise les moteurs de 3,5 L; le vôtre fait 2,4 L.',
  ]);
  assert.match(recallMismatch(r, v)[0], /^It covers vehicles with all-wheel or four-wheel drive; yours is front-wheel drive\.$/);
  assert.deepEqual(feedbackUrl({ kind: 'idea', message: '' }, { lang: 'fr' }).errors, ['Écrivez votre commentaire.']);
  assert.match(feedbackUrl({ kind: 'toString', message: 'x' }).errors.join(), /type/, 'only own feedback kinds count');
});
