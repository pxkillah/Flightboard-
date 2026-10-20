// Static checks on the web page, so a change can't quietly break its security policy or its
// promise to make no requests except to NHTSA, and to MarketCheck only with the visitor's key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
const directive = (name) => csp.split(';').map((d) => d.trim().split(/\s+/)).find(([n]) => n === name)?.slice(1) ?? null;

test('the security policy only allows the page itself, NHTSA, MarketCheck and the report server', async () => {
  assert.deepEqual(directive('default-src'), ["'none'"]);
  assert.deepEqual(directive('script-src'), ["'self'"]);
  const { REPORT_API } = await import('../src/paid.js');
  assert.deepEqual(directive('connect-src'), ['https://vpic.nhtsa.dot.gov', 'https://api.nhtsa.gov', 'https://api.marketcheck.com', ...(REPORT_API ? [REPORT_API] : [])]);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test('the MarketCheck key is typed into a masked field and never part of the page', () => {
  const field = html.match(/<input[^>]*id="mc-key"[^>]*>/)?.[0] ?? '';
  assert.match(field, /type="password"/);
  assert.match(field, /autocomplete="off"/);
  assert.doesNotMatch(field, /\svalue=/);
  assert.doesNotMatch(html + app, /api_key/, 'only src/sources/marketcheck.js builds MarketCheck URLs');
});

test('nothing in the page needs inline script, which the policy blocks', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'inline <script>');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handler attribute');
  assert.doesNotMatch(html + app, /javascript:/i);
  assert.doesNotMatch(html, /<style[\s>]/, 'styles belong in app.css');
});

test('every file the page loads exists', () => {
  const refs = [...html.matchAll(/(?:href|src)="([^"#:?]+)"/g)].map((m) => m[1]);
  const imports = [...app.matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
  for (const f of [...refs, ...imports]) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
});

test('every translation key the page uses exists in both languages', async () => {
  const { MESSAGES } = await import('../src/i18n.js');
  const keys = [
    ...[...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(',').map((p) => p.split(':')[1].trim())),
    ...[...html.matchAll(/data-work-key="([^"]+)"/g)].map((m) => m[1]),
    ...[...app.matchAll(/\bt\('([a-zA-Z0-9.]+)'/g)].map((m) => m[1]),
  ];
  assert.ok(keys.length > 100);
  for (const k of new Set(keys)) {
    assert.ok(k in MESSAGES.en, `missing English text for ${k}`);
    assert.ok(k in MESSAGES.fr, `missing French text for ${k}`);
  }
});
