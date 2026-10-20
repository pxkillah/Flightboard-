// The sources write dates in different orders: NHTSA recalls day/month/year, Transport Canada
// month/day/year with a time, MarketCheck ISO. Parsers turn them all into YYYY-MM-DD so the CLI
// and the page show one unambiguous format. Anything unreadable is returned as it was.
const pad = (n) => String(n).padStart(2, '0');

export function isoDate(s, order = 'dmy') {
  if (s === null || s === undefined || s === '') return null;
  const text = String(s).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/);
  if (!m) return text;
  let [day, month] = order === 'mdy' ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
  // A month over 12 means the order was the other way round for this one.
  if (month > 12 && day <= 12) [day, month] = [month, day];
  if (month < 1 || month > 12 || day < 1 || day > 31) return text;
  return `${m[3]}-${pad(month)}-${pad(day)}`;
}
