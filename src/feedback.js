// User feedback. The app makes no requests except to NHTSA, so feedback isn't posted from
// here: it becomes a pre-filled email that the person reviews and sends from their own mail app.
import { normalizeVin } from './vin.js';
import { t } from './i18n.js';

// Feedback, support and privacy requests. Empty until the owner sets up the address; the
// page hides Send feedback while it's empty, and mobile/scripts/check-release.js refuses
// to ship without it.
export const SUPPORT_EMAIL = '';

export const KINDS = {
  problem: { label: 'Problem', tag: 'Problem' },
  idea: { label: 'Idea', tag: 'Idea' },
  data: { label: 'Wrong data', tag: 'Data' },
};

export const MAX_MESSAGE = 1500;
// Mail apps handle long mailto: links, but not unlimited ones. Non-Latin text takes up to
// nine characters per letter once encoded, so it reaches this before MAX_MESSAGE does.
const MAX_URL = 8000;

// Returns { url, errors[] }. The VIN is included only when given and well formed, so the
// caller decides (with the user's consent) whether to pass it. The check digit isn't
// required because the page can show forced lookups of imports that skip it.
export function feedbackUrl({ kind, message, vin } = {}, { email = SUPPORT_EMAIL, lang = 'en' } = {}) {
  const errors = [];
  const k = Object.prototype.hasOwnProperty.call(KINDS, kind) ? kind : null;
  if (!k) errors.push(t(lang, 'fb.errKind'));
  const text = String(message ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) errors.push(t(lang, 'fb.errEmpty'));
  else if (text.length > MAX_MESSAGE) errors.push(t(lang, 'fb.errLong', { max: MAX_MESSAGE }));
  if (errors.length) return { url: null, errors };

  // Count code points, not UTF-16 units, so the cut never splits an emoji.
  const first = [...text.split('\n')[0].replace(/\s+/g, ' ').trim()];
  const summary = first.length > 60 ? `${first.slice(0, 59).join('').trimEnd()}…` : first.join('');
  const subject = `[${KINDS[k].tag}] ${summary}`;

  const v = normalizeVin(vin);
  const body = [
    text,
    '',
    '---',
    /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? `VIN: ${v}` : null,
    'Sent from Car Report.',
  ].filter((l) => l !== null).join('\n');

  // encodeURIComponent, not URLSearchParams: mail apps show a "+" as a plus, not a space.
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (url.length > MAX_URL) return { url: null, errors: [t(lang, 'fb.errTooLong')] };
  return { url, errors: [] };
}
