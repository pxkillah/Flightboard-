// The website (scripts/build-site.js): built into a temporary folder and checked the way the
// page itself is, so a change can't add a script, a third-party request or a broken link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { build } from '../scripts/build-site.js';
import { STRINGS } from '../site/strings.js';

const dest = build(mkdtempSync(join(tmpdir(), 'car-report-site-')));
const page = (p) => readFileSync(join(dest, p), 'utf8');
process.on('exit', () => rmSync(dest, { recursive: true, force: true }));

test('English and French have the same text keys, and none is empty', () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.fr).sort());
  for (const [lang, t] of Object.entries(STRINGS)) for (const [k, v] of Object.entries(t)) assert.ok(String(v).trim(), `${lang}.${k}`);
});

test('both pages are filled in completely, in their own language', () => {
  for (const [p, lang] of [['index.html', 'en'], ['fr/index.html', 'fr-CA']]) {
    const html = page(p);
    assert.doesNotMatch(html, /\{\{|\}\}/, p);
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.match(html, /CA\$11\.99|11,99 \$ CA/, `${p} shows the price`);
  }
  assert.match(page('fr/index.html'), /Connaissez le véhicule/);
});

test('the site runs no scripts and loads nothing from other sites', () => {
  for (const p of ['index.html', 'fr/index.html', '404.html']) {
    const html = page(p);
    assert.doesNotMatch(html, /<script/i, p);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, p);
    for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(mailto:|#)/.test(url)) continue;
      assert.doesNotMatch(url, /^(https?:)?\/\//, `${p} loads ${url}`);
    }
  }
  const headers = page('_headers');
  assert.match(headers, /Content-Security-Policy: default-src 'none';/);
  assert.doesNotMatch(headers, /script-src/);
  for (const h of ['frame-ancestors \'none\'', 'X-Content-Type-Options: nosniff', 'Strict-Transport-Security', 'Referrer-Policy: no-referrer']) assert.ok(headers.includes(h), h);
});

test('every file a page links to is in the build', () => {
  for (const p of ['index.html', 'fr/index.html']) {
    for (const [, url] of page(p).matchAll(/(?:src|href)="([^"#:]+)(?:#[^"]*)?"/g)) {
      const target = join(dest, dirname(p), url.endsWith('/') ? `${url}index.html` : url);
      assert.ok(existsSync(target), `${p} → ${url}`);
    }
  }
  for (const f of ['privacy.html', 'support.html', 'robots.txt', '404.html', 'site.css']) assert.ok(existsSync(join(dest, f)), f);
});

test('every screenshot has a description', () => {
  for (const p of ['index.html', 'fr/index.html']) {
    for (const [, alt] of page(p).matchAll(/<img [^>]*alt="([^"]*)"/g)) if (!/brand/.test(alt)) assert.notEqual(alt, undefined);
    const shots = [...page(p).matchAll(/<img src="[^"]*img\/[^"]+" [^>]*alt="([^"]+)"/g)];
    assert.equal(shots.length, 5, p);
  }
});

test('until the apps are live, the page says "coming soon" rather than linking nowhere', async () => {
  const { SITE } = await import('../site/config.js');
  if (!SITE.appStore && !SITE.googlePlay) assert.match(page('index.html'), /class="soon"/);
});
