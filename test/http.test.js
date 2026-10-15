import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJson, errorKind, timeoutSignal, HttpError, FormatError } from '../src/http.js';

const res = (status, body = {}) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
function sequence(...responses) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
}

test('retries a server error with backoff, then returns the data', async () => {
  const { fetch, calls } = sequence(res(503), res(502), res(200, { ok: 1 }));
  assert.deepEqual(await getJson('u', { fetch, backoffMs: 0 }), { ok: 1 });
  assert.equal(calls.length, 3);
});

test('retries a network failure but not a refused request', async () => {
  const net = sequence(new TypeError('fetch failed'), res(200, { ok: 1 }));
  assert.deepEqual(await getJson('u', { fetch: net.fetch, backoffMs: 0 }), { ok: 1 });

  const refused = sequence(res(400));
  await assert.rejects(getJson('u', { fetch: refused.fetch, backoffMs: 0 }), HttpError);
  assert.equal(refused.calls.length, 1);
});

test('gives up after the last retry with the last error', async () => {
  const { fetch, calls } = sequence(res(503));
  await assert.rejects(getJson('u', { fetch, backoffMs: 0, retries: 2 }), (e) => e instanceof HttpError && e.status === 503);
  assert.equal(calls.length, 3);
});

test('a 404 means no data', async () => {
  assert.equal(await getJson('u', { fetch: sequence(res(404)).fetch }), null);
});

test('classifies failures for the page', () => {
  assert.equal(errorKind(new TypeError('Failed to fetch')), 'unreachable');
  assert.equal(errorKind(new DOMException('slow', 'TimeoutError')), 'timeout');
  assert.equal(errorKind(new DOMException('stop', 'AbortError')), 'timeout');
  assert.equal(errorKind(new HttpError('u', 503)), 'unavailable');
  assert.equal(errorKind(new HttpError('u', 429)), 'unavailable');
  assert.equal(errorKind(new HttpError('u', 400)), 'refused');
  assert.equal(errorKind(new FormatError('x')), 'format');
  assert.equal(errorKind(new SyntaxError('Unexpected token <')), 'format');
});

test('times out without AbortSignal.timeout (Safari before 16)', async () => {
  const original = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const signal = timeoutSignal(20);
    assert.equal(signal.aborted, false);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(signal.aborted, true);
    assert.equal(errorKind(signal.reason), 'timeout');
  } finally {
    AbortSignal.timeout = original;
  }
});
