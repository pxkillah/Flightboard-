# vehicle-report

A command-line VIN lookup that builds a Carfax-style vehicle report from **free, public
government data**. It needs no API keys and has no dependencies (Node ≥ 22). With your own
MarketCheck key, the command line and the web page can also show the car's online sale listing
history (see below).

```
$ node bin/vehicle-report.js 1HGCM82633A004352
$ node bin/vehicle-report.js 1HGCM82633A004352 --json
```

## Car Report: the iPhone and Android app

The web page below is also **Car Report**, an app for the App Store and Google Play. `mobile/`
bundles the page into native iOS and Android projects with Capacitor, and adds a camera VIN
scanner, saving files through the share sheet, and a durable copy of saved records. How to
build and release it from a Mac is in `docs/app-release.md`; the store text and screenshots
are in `mobile/store/`.

## Web page (works on a phone)

`index.html` (with `app.js` and `app.css`) is the same report as a mobile-friendly web page. It runs entirely in the browser
and calls the government APIs directly, so it needs no server. To host it free with GitHub Pages (which, on the free plan, needs the repository to be public):
Settings → Pages → Source "Deploy from a branch" → `main` / `(root)` → Save. The page is then at
`https://<user>.github.io/<repo>/`, and `?vin=<VIN>` in the URL runs a lookup straight away.

The page also has **My records**: an owner-kept service, odometer and registration log per VIN.
It warns when an odometer reading is lower than an earlier one and when a registration is expired or
expires within 30 days, and it can copy the history as text or save and restore a backup file.
Records are stored only in that browser (`localStorage`) and never uploaded. They are owner-entered
and not verified, and the shared history text says so. Each odometer reading is entered in km or
miles and keeps its unit; the rollback check converts between them. Registrations can be in a
Canadian province or territory, or a US state. Costs are in Canadian dollars.

The page is in **English and French** (Canada). It follows the device's language, and the
switch on the home page or in the footer is remembered; `?lang=fr` or `?lang=en` in the address picks
one. Dates, numbers, money and the CSV export follow the language. Text that comes from NHTSA,
such as recall summaries, stays in English.

**Send feedback** (in the footer) opens a short form for a problem, an idea or wrong data. The page
doesn't send it anywhere itself. It opens a pre-filled email in the person's own mail app, to the
support address in `src/feedback.js`. The VIN is included only if they tick the box. The button is
hidden until that address is set.

**Listing history** shows when the vehicle was advertised for sale, from MarketCheck, once a
visitor adds their own MarketCheck key (see below). The key is saved only in that browser.

It installs as a Home Screen app (Safari: Share → Add to Home Screen), using
`manifest.webmanifest` and the icons in `icons/`. The page makes no requests except to NHTSA,
to MarketCheck when a visitor with a key asks for a listing history, and, once it's set up, to
the owner's GlobalVIN Worker when a visitor asks for a GlobalVIN lookup: the fonts are self-hosted in
`fonts/` (Barlow Semi Condensed and B612 Mono, both under the SIL Open Font License, with license
files alongside).

## What it pulls

| Section | Source | Endpoint |
|---|---|---|
| VIN check digit | local (49 CFR 565) | — |
| Year / make / model / trim / engine / plant | NHTSA vPIC | `vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}` |
| Canadian recalls | Transport Canada recall DB | `data.tc.gc.ca/v1.3/api/eng/vehicle-recall-database/...` |
| US recalls (incl. "do not drive" flags) | NHTSA | `api.nhtsa.gov/recalls/recallsByVehicle` |
| Owner complaints (crash/fire/injury counts, top components) | NHTSA | `api.nhtsa.gov/complaints/complaintsByVehicle` |
| Crash-test stars | NHTSA NCAP | `api.nhtsa.gov/SafetyRatings/...` |

Dates from every source are shown as YYYY-MM-DD (NHTSA sends day/month/year, Transport Canada
month/day/year).

### Listing history (optional, paid, your own key)

With a [MarketCheck](https://developers.marketcheck.com) API key, the report adds the online
sale listings MarketCheck has recorded for the VIN: when and where it was listed, new or used,
asking prices and advertised mileage, grouped into each stay on the market, with a warning when
an advertised reading is lower than an earlier one. MarketCheck's free plan allows 500 calls a
month; paid plans charge $0.006 (USD) a call, and a lookup makes one call per 50 listings, at
most 4.

- **Command line:** put the key in `MARKETCHECK_API_KEY` or in `~/.marketcheck_key` (readable
  only by you: `chmod 600`); `--no-history` skips it. The key is never printed.
- **Web page:** tap **Add your MarketCheck key** in the Listing history panel and paste the key.
  It's saved only in that browser, and the page sends it only to MarketCheck, only when you tap
  **Show listing history** or **Check again**. The answer is kept on the device, so opening the
  report again costs nothing. The panel also checks your latest odometer reading from My records
  against the advertised ones. Anyone who uses that browser could find the key, so use a key
  you can cancel on your MarketCheck dashboard, and remove it from the page (or Erase all) on a
  shared device. The published page never contains a key.

- It covers dealer websites (US since 2015, Canada since 2018) and Canadian private sellers
  since 2023, not classified sites such as Kijiji or AutoTrader.ca. "No listings" doesn't
  mean the car was never sold.
- Prices and readings are as advertised, not verified. MarketCheck calls the field `miles`,
  but Canadian dealers advertise km, so a listing in a province is read as km and CAD.
- It is not accident, service, ownership or lien history.

Each section is fetched on its own. If one API is down, the report still comes back with that
section listed under `errors`.

Recalls are fetched by year/make/model, not by the individual VIN. Each recall's summary is then compared with the decoded VIN (drive type, engine, fuel, roof height), and recalls that explicitly name a different configuration are flagged as probably not applying (`mismatch` in the JSON). They are flagged, never dropped. They show which campaigns
apply to the model, not whether this particular car has been repaired. For a per-VIN open-recall
check, use the manufacturer's recall lookup or Transport Canada's.

### GlobalVIN lookup (optional, the owner's key, through a Cloudflare Worker)

The page can add a **GlobalVIN** panel that looks the VIN up in GlobalVIN when a visitor taps
**Look up on GlobalVIN**. GlobalVIN's API (`POST /v1/api/vin`) takes its key in the JSON body,
so the page never calls GlobalVIN directly: it POSTs `{ "vin": "..." }` to a small Cloudflare
Worker in `workers/globalvin/`, which holds the key as a secret, adds it, and forwards the
request. The key is never in the page, the apps or this repo. The panel stays hidden until
`WORKER_URL` is set (decision 17).

The Worker exposes only `POST /v1/api/vin`. It trims and uppercases the VIN and answers 400 if
it isn't 17 VIN characters (no I, O or Q) or the body isn't JSON, 405 for other methods, 404 for
other paths, 429 over the per-IP rate limit, 500 if `GLOBALVIN_BASE_URL` or the key is missing,
and 502 if GlobalVIN can't be reached. Otherwise it passes GlobalVIN's status and body through,
caching successful answers per VIN (`X-Cache: HIT` or `MISS`). Settings, in
`workers/globalvin/wrangler.toml`:

| Setting | What it is |
|---|---|
| `GLOBALVIN_BASE_URL` | GlobalVIN's API host, https, no trailing slash. **TODO: not filled in yet.** |
| `GLOBALVIN_API_KEY` | Secret, set with `wrangler secret put`; never in a file. |
| `ALLOWED_ORIGINS` | Comma-separated origins a browser may read answers from; `*` (the default) allows any. |
| `CACHE_TTL_SECONDS` | How long a VIN's answer is cached; default 86400 (a day). |
| `RATE_LIMITER` | Per-IP limit, 20 lookups a minute; remove the `[[ratelimits]]` block to turn it off. |

**Set up** (needs a Cloudflare account; `npx` fetches Wrangler, nothing is added to the repo):

1. In `workers/globalvin/wrangler.toml`, set `GLOBALVIN_BASE_URL` to GlobalVIN's API host.
2. Add the key as a secret (it prompts for it):
   ```bash
   cd workers/globalvin && npx wrangler secret put GLOBALVIN_API_KEY
   ```
3. Deploy, and note the `https://….workers.dev` address it prints:
   ```bash
   cd workers/globalvin && npx wrangler deploy
   ```
4. Lock down `ALLOWED_ORIGINS` to where the page runs: the website's origin (for example
   `https://pxkillah.github.io`), plus `capacitor://localhost` and `https://localhost` for the
   iOS and Android apps. Redeploy. CORS only stops other websites reading answers in a browser;
   the rate limit and the cache are what protect the GlobalVIN bill from scripts.
5. Point the page at it: set `WORKER_URL` in `src/sources/globalvin.js` to the Worker's
   address, and add the same origin to `connect-src` in `index.html`'s Content-Security-Policy.
   `npm test` fails if the two don't match.

**Local dev:** copy `workers/globalvin/.dev.vars.example` to `.dev.vars` (git-ignored), put
the key in it, and run `npx wrangler dev` in `workers/globalvin/`. It serves on
`http://localhost:8787`:

```bash
curl -s -X POST http://localhost:8787/v1/api/vin -H 'content-type: application/json' -d '{"vin":"1HGCM82633A004352"}'
```

To try the page against it, temporarily set `WORKER_URL` to `http://localhost:8787` and add
that to `connect-src`; don't commit that. The Worker's tests run offline with `npm test`.

GlobalVIN's response format isn't documented here, so the panel shows its answer as labelled
fields as GlobalVIN sends them. Once the format is known, a parser like the other sources' can
replace that.

## What it does not include (and where that data actually lives)

A Carfax Canada report's core value comes from private data feeds: insurance claims, police
reports, auctions, dealer service records, provincial registrations and liens. None of that is
in a public API. The legitimate ways to get it are:

- **Carfax Canada / VHR dealer and partner integrations.** These are commercial agreements
  with Carfax.
- **Liens:** provincial personal-property registry searches, for example Ontario PPSA or BC PPR.
  These are paid, per search.
- **Ontario:** Used Vehicle Information Package (UVIP) from ServiceOntario, which includes
  registered owners, liens and odometer.
- **BC:** ICBC vehicle claim history report.
- **Québec:** SAAQ vehicle information, and the RDPRM for liens.
- **Stolen status:** the CPIC public stolen vehicle check.

Scraping carfax.ca or getting around its paywall would breach its terms of use, so this
project does not do that.

## Privacy

- **What leaves your device:** the VIN goes to NHTSA's VIN decoder (vPIC), and the decoded
  year, make and model go to NHTSA's recall, complaint and crash-rating services. If you've
  added a MarketCheck key, the VIN and your key go to MarketCheck when you ask for a listing
  history (the command line asks on every lookup; the page only when you tap the button). Once
  the GlobalVIN lookup is set up, tapping Look up on GlobalVIN sends the VIN to the owner's
  Cloudflare Worker, which asks GlobalVIN and caches the answer for that VIN for a day. GitHub
  Pages, which hosts the page, sees each page request, including `?vin=` when you open a
  report link.
- **What stays on your device:** your records, the VINs you check, your MarketCheck key and
  the listing histories it fetched, in this browser's storage, and any backup or CSV files you
  save. Backups don't include the key. There are no accounts, cookies or
  analytics. Remove a vehicle from its page, or erase everything from the page's footer.
- **Camera (app only):** used only when you tap the scan button, to read the VIN barcode on
  the phone. No picture is saved or sent.
- **Feedback:** Send feedback opens an email in your own mail app with your message (and the
  VIN, only if you tick the box). Nothing is sent until you send it.
- The full privacy policy is `privacy.html`, which is also inside the app.
- The report is free and provided as is. Recalls are matched by model, so confirm with a
  dealer. Not affiliated with NHTSA, Transport Canada, MarketCheck or Carfax.

## Run it locally

Needs Node 22 or later and no install step.

```
git clone https://github.com/pxkillah/Flightboard-.git && cd Flightboard-
npm test                                   # offline tests
node bin/vehicle-report.js 1HGCM82633A004352
python3 -m http.server 8000                # then open http://localhost:8000
```

The page has to be served over HTTP because browsers don't load ES modules from `file://`.
`?vin=<VIN>` in the address runs a lookup straight away. `node scripts/live-check.js` calls the
real NHTSA APIs; GitHub Actions runs it daily and on pull requests that change the NHTSA code. Architecture decisions are in
`docs/decisions.md`, incident steps in `docs/runbook.md`, and the status against the
production standard in `docs/production-readiness.md`.

## Tests

```
npm test
```

The tests run offline against stubbed responses in each API's documented format. CI runs
them on Node 22 and 24 for every pull request.

## Licence

MIT, copyright pxkillah. See `LICENSE`.
