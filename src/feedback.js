// User feedback for the web page. The page makes no requests except to NHTSA (and MarketCheck,
// with a visitor's own key), so feedback isn't posted from here: it becomes a pre-filled GitHub
// issue the user reviews and submits.
import { normalizeVin } from './vin.js';
import { t } from './i18n.js';

export const FEEDBACK_REPO = 'pxkillah/Flightboard-';

export const KINDS = {
  problem: { label: 'Problem', tag: 'Problem' },
  idea: { label: 'Idea', tag: 'Idea' },
  data: { label: 'Wrong data', tag: 'Data' },
};

export const MAX_MESSAGE = 1500;
// A signed-out visitor is redirected to /login?return_to=<this URL, encoded again>. GitHub
// drops return_to once that gets near 7.7K characters, and the pre-filled issue is lost.
// Non-Latin text is encoded twice over, so it hits this long before MAX_MESSAGE does.
const MAX_RETURN_TO = 6000;

// Returns { url, errors[] }. The VIN is included only when given and well formed, so the
// caller decides (with the user's consent) whether to pass it. The check digit isn't
// required because the page can show forced lookups of imports that skip it.
export function feedbackUrl({ kind, message, vin } = {}, { repo = FEEDBACK_REPO, lang = 'en' } = {}) {
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
  if (encodeURIComponent(url).length > MAX_RETURN_TO) return { url: null, errors: [t(lang, 'fb.errTooLong')] };
  return { url, errors: [] };
}
