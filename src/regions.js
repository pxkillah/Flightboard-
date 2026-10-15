// Where a vehicle is registered: Canadian provinces and territories by their postal code
// (stored as is, for example 'ON'), US states as 'US-' plus the postal code (for example
// 'US-CA'), and 'Outside Canada' from before US states were listed. Names in English and French.

export const PROVINCES = {
  AB: ['Alberta', 'Alberta'],
  BC: ['British Columbia', 'Colombie-Britannique'],
  MB: ['Manitoba', 'Manitoba'],
  NB: ['New Brunswick', 'Nouveau-Brunswick'],
  NL: ['Newfoundland and Labrador', 'Terre-Neuve-et-Labrador'],
  NS: ['Nova Scotia', 'Nouvelle-Écosse'],
  NT: ['Northwest Territories', 'Territoires du Nord-Ouest'],
  NU: ['Nunavut', 'Nunavut'],
  ON: ['Ontario', 'Ontario'],
  PE: ['Prince Edward Island', 'Île-du-Prince-Édouard'],
  QC: ['Quebec', 'Québec'],
  SK: ['Saskatchewan', 'Saskatchewan'],
  YT: ['Yukon', 'Yukon'],
};

export const STATES = {
  AL: ['Alabama', 'Alabama'], AK: ['Alaska', 'Alaska'], AZ: ['Arizona', 'Arizona'],
  AR: ['Arkansas', 'Arkansas'], CA: ['California', 'Californie'], CO: ['Colorado', 'Colorado'],
  CT: ['Connecticut', 'Connecticut'], DE: ['Delaware', 'Delaware'],
  DC: ['District of Columbia', 'District de Columbia'], FL: ['Florida', 'Floride'],
  GA: ['Georgia', 'Géorgie'], HI: ['Hawaii', 'Hawaï'], ID: ['Idaho', 'Idaho'],
  IL: ['Illinois', 'Illinois'], IN: ['Indiana', 'Indiana'], IA: ['Iowa', 'Iowa'],
  KS: ['Kansas', 'Kansas'], KY: ['Kentucky', 'Kentucky'], LA: ['Louisiana', 'Louisiane'],
  ME: ['Maine', 'Maine'], MD: ['Maryland', 'Maryland'], MA: ['Massachusetts', 'Massachusetts'],
  MI: ['Michigan', 'Michigan'], MN: ['Minnesota', 'Minnesota'], MS: ['Mississippi', 'Mississippi'],
  MO: ['Missouri', 'Missouri'], MT: ['Montana', 'Montana'], NE: ['Nebraska', 'Nebraska'],
  NV: ['Nevada', 'Nevada'], NH: ['New Hampshire', 'New Hampshire'], NJ: ['New Jersey', 'New Jersey'],
  NM: ['New Mexico', 'Nouveau-Mexique'], NY: ['New York', 'New York'],
  NC: ['North Carolina', 'Caroline du Nord'], ND: ['North Dakota', 'Dakota du Nord'],
  OH: ['Ohio', 'Ohio'], OK: ['Oklahoma', 'Oklahoma'], OR: ['Oregon', 'Oregon'],
  PA: ['Pennsylvania', 'Pennsylvanie'], PR: ['Puerto Rico', 'Porto Rico'],
  RI: ['Rhode Island', 'Rhode Island'], SC: ['South Carolina', 'Caroline du Sud'],
  SD: ['South Dakota', 'Dakota du Sud'], TN: ['Tennessee', 'Tennessee'], TX: ['Texas', 'Texas'],
  UT: ['Utah', 'Utah'], VT: ['Vermont', 'Vermont'], VA: ['Virginia', 'Virginie'],
  WA: ['Washington', 'Washington'], WV: ['West Virginia', 'Virginie-Occidentale'],
  WI: ['Wisconsin', 'Wisconsin'], WY: ['Wyoming', 'Wyoming'],
};

export const ELSEWHERE = 'Outside Canada';
const ELSEWHERE_NAME = ['Elsewhere', 'Ailleurs'];
const i = (lang) => (lang === 'fr' ? 1 : 0);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// The display name for a stored region value; anything unknown is shown as typed.
export function regionName(code, lang = 'en') {
  const c = String(code ?? '');
  if (has(PROVINCES, c)) return PROVINCES[c][i(lang)];
  if (c.startsWith('US-') && has(STATES, c.slice(3))) return STATES[c.slice(3)][i(lang)];
  if (c === ELSEWHERE) return ELSEWHERE_NAME[i(lang)];
  return c;
}

// Options for the region picker, sorted by name in the given language.
export function regionOptions(lang = 'en') {
  const coll = new Intl.Collator(lang === 'fr' ? 'fr-CA' : 'en-CA');
  const sorted = (o, prefix) => Object.entries(o).map(([k, n]) => ({ value: `${prefix}${k}`, name: n[i(lang)] }))
    .sort((a, b) => coll.compare(a.name, b.name));
  return {
    canada: sorted(PROVINCES, ''),
    us: sorted(STATES, 'US-'),
    elsewhere: { value: ELSEWHERE, name: ELSEWHERE_NAME[i(lang)] },
  };
}
