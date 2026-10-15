export class HttpError extends Error {
  constructor(url, status, body) {
    super(`GET ${url} -> HTTP ${status}`);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

// The response arrived but isn't in the shape the parsers read. Parsers throw this rather
// than return an empty list, so a format change shows as an error, never as "no recalls".
export class FormatError extends Error {
  constructor(what) {
    super(`${what} wasn't in the expected format`);
    this.name = 'FormatError';
  }
}

// What kind of failure an error is, so the page can say something a person can act on.
export function errorKind(err) {
  if (err instanceof FormatError || err instanceof SyntaxError) return 'format';
  if (err instanceof HttpError) return err.status >= 500 || err.status === 429 ? 'unavailable' : 'refused';
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout';
  return 'unreachable';
}

// AbortSignal.timeout arrived in Safari 16; build the same signal by hand where it's missing.
export function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
  return c.signal;
}

// Browsers manage User-Agent themselves, and setting it would force a CORS preflight.
const HEADERS = typeof window === 'undefined'
  ? { accept: 'application/json', 'user-agent': 'vehicle-report/0.1' }
  : { accept: 'application/json' };

export async function getJson(url, { fetch = globalThis.fetch, timeoutMs = 15000, retries = 2, backoffMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: timeoutSignal(timeoutMs),
      });
      if (res.status === 404) return null;
      const text = await res.text();
      if (!res.ok) throw new HttpError(url, res.status, text);
      return text ? JSON.parse(text) : null;
    } catch (err) {
      lastErr = err;
      const retryable = !(err instanceof HttpError) || err.status >= 500 || err.status === 429;
      if (!retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
    }
  }
  throw lastErr;
}
