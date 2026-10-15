// Static checks on the web page, so a change can't quietly break its security policy or its
// promise to make no requests except to NHTSA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
const directive = (name) => csp.split(';').map((d) => d.trim().split(/\s+/)).find(([n]) => n === name)?.slice(1) ?? null;

test('the security policy only allows the page itself and NHTSA', () => {
  assert.deepEqual(directive('default-src'), ["'none'"]);
  assert.deepEqual(directive('script-src'), ["'self'"]);
  assert.deepEqual(directive('connect-src'), ['https://vpic.nhtsa.dot.gov', 'https://api.nhtsa.gov']);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
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
