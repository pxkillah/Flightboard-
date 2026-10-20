# Architecture decisions

Why VIN Report is built the way it is. Add an entry when a decision would be expensive to
reverse or surprising to someone new; don't edit old entries, supersede them.

## 1. Only free, public data (2026-10-13)

The report uses NHTSA (vPIC, recalls, complaints, NCAP ratings) and Transport Canada recalls.
Accident, lien, ownership and odometer history live in private or paid sources (listed in
the README). Scraping carfax.ca or getting around its paywall would breach its terms, so the
app doesn't, and it says what it can't show instead.

## 2. A static page and a CLI, no server, no dependencies (2026-10-13)

The same modules in `src/` run in Node and in the browser, with no build step and no npm
dependencies. GitHub Pages hosts the page for free. There's nothing to patch, scale or pay
for, and the supply-chain surface is the repository itself. The cost: anything that would
need a server (accounts, sync, server-side logs) is out of scope until this is revisited.

## 3. The page contacts nothing but NHTSA (2026-10-14)

Transport Canada's API doesn't allow cross-origin requests, so the page links to its recall
search instead of fetching it (#3); the CLI still fetches it. Fonts are self-hosted and there
are no analytics or error-tracking services. The promise is enforced by a
Content-Security-Policy meta tag (GitHub Pages can't send headers) and `test/page.test.js`.
Consequence: errors are only seen if visitors report them (Send feedback) or the daily live
check catches them.

## 4. Recalls are flagged, never dropped (2026-10-14)

Recall feeds are keyed by year, make and model, so a model's list includes campaigns for
configurations this vehicle doesn't have. `src/recallMatch.js` flags a recall as probably not
applying only on an explicit contradiction, and the page still lists it. A false "doesn't
apply" is worse than a false "may apply".

## 5. Owner records stay on the device (2026-10-15)

My records keeps service, odometer and registration entries in `localStorage`, with backup
files, CSV export and copy-as-text for moving them. No accounts and no upload means no
personal data held anywhere else. The cost: storage can be cleared by the browser, so the
page asks the browser to keep it and reminds owners to save a backup.

## 6. Feedback goes through GitHub issues (2026-10-15)

Send feedback opens a pre-filled GitHub issue rather than posting from the page, which keeps
decision 3. Posting needs a GitHub account and is public; the VIN is included only when the
person ticks the box. Security reports go through private reporting instead (`SECURITY.md`).

## 7. A failed or changed answer is never shown as "none" (2026-10-15)

Parsers throw a `FormatError` when a response lacks the fields they read, and the report
records each section's error kind (`unreachable`, `timeout`, `unavailable`, `refused`,
`format`, or `unrecognized` for a VIN NHTSA doesn't know). The page explains the failure
instead of saying "no recalls". `scripts/live-check.js` runs daily against the real APIs.

## 8. Saved data is versioned; stored data is checked leniently (2026-10-15)

The saved object carries `version` (now 3). `readStore` upgrades older versions on load.
Typed input and imported backups get strict validation (real dates, limits, whole cents);
data this page already saved only needs the right shape, so a record an older version
accepted isn't lost to a stricter rule. Unreadable data is copied aside before anything
writes over it. A store with a newer version than the page knows is read but not written,
so a reverted deploy can't drop fields it doesn't understand. Keep version changes additive.

## 9. Money in whole cents (2026-10-15)

Costs are stored as integer `costCents`, parsed from the typed digits, never through floating
point. Typed amounts accept English and French Canadian formats (89.99, 89,99, 1 234,56).
Every amount is Canadian dollars: the owner decided this on 2026-10-15 rather than store a
currency per record. The form, CSV header and shared history say "CAD". If the app ever needs
other currencies, add a currency field in a new store version (decision 8).

## 10. Odometer units per reading, and US states (2026-10-15)

The owner chose to plan for US vehicles. Each reading stores its own unit (`km` or `mi`), so a
car bought across the border keeps its history as it was read; nothing is converted when
saved. Rollback checks convert to km and allow 1 km of rounding. A vehicle remembers the unit
of its latest reading to preselect the form. Regions store Canadian postal codes as before and
US states as `US-` plus the code, so old data needs no change; the older "Outside Canada" value
still reads. This is store version 3; version 2 data (km only) upgrades on load.

## 11. English and French, all in one file (2026-10-15)

Every string the page or `src/` shows lives in `src/i18n.js` in both languages, with
plurals through `Intl.PluralRules` and Canadian formats for dates, numbers and money; place
names live in `src/regions.js`. Tests fail if a key or placeholder is missing in either
language, or if the page uses a key that doesn't exist. Text from NHTSA stays in English and is
marked `lang="en"`, since translating it would mean sending it to a translation service
(decision 3). The Transport Canada link stays on the English page because the French address
couldn't be confirmed from here. The French was written by the AI that wrote the code and
still needs a fluent speaker's review (UX-09).

## 12. Paid listing history in the CLI only, with the user's own key (2026-10-20)

Partly supersedes decision 1 for the CLI. The owner chose to add MarketCheck's History by VIN:
the online sale listings recorded for a VIN, with asking prices and advertised mileage. It's
paid and keyed, so it runs only in the CLI and only when `MARKETCHECK_API_KEY` or
`~/.marketcheck_key` holds a key; the page is unchanged and still contacts nothing but NHTSA
(decision 3), because a key in a public page's URLs could be copied and billed. MarketCheck
names the field `miles` everywhere, but Canadian dealers advertise km, so a listing in a
province is read as km and CAD; the report says readings are as advertised. MarketCheck's
US-only NMVTIS title reports ($0.49 each) and its lack of accident and service data were
reviewed and left out. Accident, lien, ownership and service history stay out of scope.

## 13. Listing history on the page, with the visitor's own key (2026-10-20)

Partly supersedes decisions 3 and 12. The owner asked to see the listing history in the app.
A visitor adds their own MarketCheck key in a masked field; it's saved in that browser's
`localStorage` under the store's prefix (so Erase all removes it, and backups never include
it) and sent only to `api.marketcheck.com`, which the Content-Security-Policy now allows next to
NHTSA. MarketCheck answers cross-origin requests from any site (checked from the owner's laptop
on 2026-10-20), and the request sends no custom headers, so there's no preflight. The page asks
MarketCheck only when the visitor taps Show listing history or Check again, because every call
is billed to their key; the answer is kept per VIN (the 20 most recent) and shown from the
device after that. No key is ever in the published page, which was decision 12's reason for
leaving the page out. What remains: anyone who can use that browser, and any page published
under pxkillah.github.io (every GitHub Pages site there shares the browser storage), could read
the key. The key sheet says the first and that removing the key here doesn't cancel it;
`SECURITY.md` covers both and how to cancel a key.
The panel also checks the owner's latest odometer reading in My records against the advertised
ones. Considered instead: a small proxy holding the owner's key (for example a Cloudflare
Worker), which keeps the key off devices but needs an account, a service to run, and a way to
stop strangers spending the owner's calls.
