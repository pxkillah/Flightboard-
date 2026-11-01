import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackUrl, MAX_MESSAGE } from '../src/feedback.js';

const email = 'help@example.com';
const fb = (input) => feedbackUrl(input, { email });
const parse = (url) => {
  const [to, query] = url.slice('mailto:'.length).split('?');
  const p = Object.fromEntries(query.split('&').map((kv) => kv.split('=')).map(([k, v]) => [k, decodeURIComponent(v)]));
  return { to, subject: p.subject, body: p.body, raw: query };
};

test('requires a known type and a message', () => {
  assert.match(fb({ kind: 'nope', message: 'hi' }).errors.join(), /type/);
  assert.match(fb({ kind: 'idea', message: '   ' }).errors.join(), /Write/);
  assert.equal(fb({}).errors.length, 2);
  assert.equal(fb({ kind: 'idea', message: '' }).url, null);
});

test('builds a pre-filled email to the support address', () => {
  const { url, errors } = fb({ kind: 'idea', message: '  Add a dark mode toggle\nIt would help at night.  ' });
  assert.deepEqual(errors, []);
  const { to, subject, body, raw } = parse(url);
  assert.equal(to, email);
  assert.equal(subject, '[Idea] Add a dark mode toggle');
  assert.match(body, /^Add a dark mode toggle\nIt would help at night\.\n\n---\n/);
  assert.match(body, /Sent from Car Report\.$/);
  assert.doesNotMatch(raw, /\+/, 'spaces are %20, which mail apps read as spaces');
});

test('tags the subject by type and shortens long first lines', () => {
  assert.match(parse(fb({ kind: 'problem', message: 'Search fails' }).url).subject, /^\[Problem\] /);
  assert.match(parse(fb({ kind: 'data', message: 'Wrong engine' }).url).subject, /^\[Data\] /);
  const { subject } = parse(fb({ kind: 'idea', message: 'x'.repeat(100) }).url);
  assert.equal(subject, `[Idea] ${'x'.repeat(59)}…`);
});

test('never splits an emoji when shortening the subject', () => {
  // The car straddles UTF-16 units 58-59, where a naive slice would cut it in half.
  const { subject } = parse(fb({ kind: 'idea', message: `${'a'.repeat(58)}🚗${'b'.repeat(10)}` }).url);
  assert.equal(subject, `[Idea] ${'a'.repeat(58)}🚗…`);
  assert.equal(parse(fb({ kind: 'idea', message: '🚗'.repeat(60) }).url).subject, `[Idea] ${'🚗'.repeat(60)}`);
});

test('includes the VIN only when one is given and well formed', () => {
  const body = (vin) => parse(fb({ kind: 'data', message: 'Wrong trim', vin }).url).body;
  assert.match(body('1hgcm82633a004352'), /\nVIN: 1HGCM82633A004352\n/);
  // Forced lookups of imports may fail the check digit; still well formed.
  assert.match(body('WVWZZZ1JZXW000001'), /VIN: WVWZZZ1JZXW000001/);
  assert.doesNotMatch(body(undefined), /VIN:/);
  assert.doesNotMatch(body('ABC123'), /VIN:/);
  assert.doesNotMatch(body('1HGCM82633A00435O'), /VIN:/);
});

test('rejects messages that are too long', () => {
  assert.match(fb({ kind: 'idea', message: 'a'.repeat(MAX_MESSAGE + 1) }).errors.join(), /under/);
  assert.ok(fb({ kind: 'idea', message: 'a'.repeat(MAX_MESSAGE) }).url);
  assert.ok(fb({ kind: 'idea', message: '%'.repeat(MAX_MESSAGE) }).url);
  // Non-Latin text grows ninefold when encoded; a full-length message is too much for a link.
  assert.match(fb({ kind: 'idea', message: '車'.repeat(MAX_MESSAGE) }).errors.join(), /too long/);
  assert.ok(fb({ kind: 'idea', message: '車'.repeat(600) }).url);
});

test('normalizes line endings', () => {
  const { body } = parse(fb({ kind: 'problem', message: 'one\r\ntwo\rthree' }).url);
  assert.match(body, /^one\ntwo\nthree\n/);
});
