// User feedback for the web page. The page makes no requests except to NHTSA, so feedback
// isn't posted from here: it becomes a pre-filled GitHub issue the user reviews and submits.
import { normalizeVin } from './vin.js';

export const FEEDBACK_REPO = 'pxkillah/Flightboard-';

export const KINDS = {
  problem: { label: 'Problem', tag: 'Problem' },
  idea: { label: 'Idea', tag: 'Idea' },
  data: { label: 'Wrong data', tag: 'Data' },
};

export const MAX_MESSAGE = 1500;
// GitHub rejects very long URLs; stay well below its limit.
const MAX_URL = 7500;

// Returns { url, errors[] }. The VIN is included only when given and well formed, so the
// caller decides (with the user's consent) whether to pass it. The check digit isn't
// required because the page can show forced lookups of imports that skip it.
export function feedbackUrl({ kind, message, vin } = {}, { repo = FEEDBACK_REPO } = {}) {
  const errors = [];
  const k = KINDS[kind] ? kind : null;
  if (!k) errors.push('Choose a feedback type.');
  const text = String(message ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) errors.push('Write your feedback.');
  else if (text.length > MAX_MESSAGE) errors.push(`Keep it under ${MAX_MESSAGE.toLocaleString('en-CA')} characters.`);
  if (errors.length) return { url: null, errors };

  const first = text.split('\n')[0].replace(/\s+/g, ' ').trim();
  const summary = first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first;
  const title = `[${KINDS[k].tag}] ${summary}`;

  const v = normalizeVin(vin);
  const body = [
    text,
    '',
    '---',
    /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? `VIN: ${v}` : null,
    'Sent from the VIN Report web page.',
  ].filter((l) => l !== null).join('\n');

  const url = `https://github.com/${repo}/issues/new?${new URLSearchParams({ title, body })}`;
  if (url.length > MAX_URL) return { url: null, errors: ['This feedback is too long to send. Please shorten it.'] };
  return { url, errors: [] };
}
