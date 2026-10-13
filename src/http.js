export class HttpError extends Error {
  constructor(url, status, body) {
    super(`GET ${url} -> HTTP ${status}`);
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

export async function getJson(url, { fetch = globalThis.fetch, timeoutMs = 15000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'vehicle-report/0.1' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return null;
      const text = await res.text();
      if (!res.ok) throw new HttpError(url, res.status, text);
      return text ? JSON.parse(text) : null;
    } catch (err) {
      lastErr = err;
      const retryable = !(err instanceof HttpError) || err.status >= 500 || err.status === 429;
      if (!retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}
