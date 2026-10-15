import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackUrl, FEEDBACK_REPO, MAX_MESSAGE } from '../src/feedback.js';

const parse = (url) => {
  const u = new URL(url);
  return { u, title: u.searchParams.get('title'), body: u.searchParams.get('body') };
};

test('requires a known type and a message', () => {
  assert.match(feedbackUrl({ kind: 'nope', message: 'hi' }).errors.join(), /type/);
  assert.match(feedbackUrl({ kind: 'idea', message: '   ' }).errors.join(), /Write/);
  assert.equal(feedbackUrl({}).errors.length, 2);
  assert.equal(feedbackUrl({ kind: 'idea', message: '' }).url, null);
});

test('builds a new-issue link on the project repo', () => {
  const { url, errors } = feedbackUrl({ kind: 'idea', message: '  Add a dark mode toggle\nIt would help at night.  ' });
  assert.deepEqual(errors, []);
  const { u, title, body } = parse(url);
  assert.equal(u.origin, 'https://github.com');
  assert.equal(u.pathname, `/${FEEDBACK_REPO}/issues/new`);
  assert.equal(title, '[Idea] Add a dark mode toggle');
  assert.match(body, /^Add a dark mode toggle\nIt would help at night\.\n\n---\n/);
  assert.match(body, /Sent from the VIN Report web page\.$/);
});

test('tags the title by type and shortens long first lines', () => {
  assert.match(parse(feedbackUrl({ kind: 'problem', message: 'Search fails' }).url).title, /^\[Problem\] /);
  assert.match(parse(feedbackUrl({ kind: 'data', message: 'Wrong engine' }).url).title, /^\[Data\] /);
  const { title } = parse(feedbackUrl({ kind: 'idea', message: 'x'.repeat(100) }).url);
  assert.equal(title, `[Idea] ${'x'.repeat(59)}…`);
});

test('includes the VIN only when one is given and well formed', () => {
  const body = (vin) => parse(feedbackUrl({ kind: 'data', message: 'Wrong trim', vin }).url).body;
  assert.match(body('1hgcm82633a004352'), /\nVIN: 1HGCM82633A004352\n/);
  // Forced lookups of imports may fail the check digit; still well formed.
  assert.match(body('WVWZZZ1JZXW000001'), /VIN: WVWZZZ1JZXW000001/);
  assert.doesNotMatch(body(undefined), /VIN:/);
  assert.doesNotMatch(body('ABC123'), /VIN:/);
  assert.doesNotMatch(body('1HGCM82633A00435O'), /VIN:/);
});

test('rejects messages that are too long', () => {
  assert.match(feedbackUrl({ kind: 'idea', message: 'a'.repeat(MAX_MESSAGE + 1) }).errors.join(), /under/);
  assert.ok(feedbackUrl({ kind: 'idea', message: 'a'.repeat(MAX_MESSAGE) }).url);
  // Non-ASCII text grows when encoded; the URL length cap catches it.
  assert.match(feedbackUrl({ kind: 'idea', message: '🚗'.repeat(700) }).errors.join(), /too long/);
});

test('normalizes line endings', () => {
  const { body } = parse(feedbackUrl({ kind: 'problem', message: 'one\r\ntwo\rthree' }).url);
  assert.match(body, /^one\ntwo\nthree\n/);
});
