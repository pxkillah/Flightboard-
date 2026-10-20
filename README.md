# vehicle-report

A command-line VIN lookup that builds a Carfax-style vehicle report from **free, public
government data**. It needs no API keys and has no dependencies (Node ≥ 22). With a MarketCheck
key, the command line can also add the car's online sale listing history (see below).

```
$ node bin/vehicle-report.js 1HGCM82633A004352
$ node bin/vehicle-report.js 1HGCM82633A004352 --json
```

## Web page (works on a phone)

`index.html` (with `app.js` and `app.css`) is the same report as a mobile-friendly web page. It runs entirely in the browser
and calls the government APIs directly, so it needs no server. To host it free with GitHub Pages:
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
doesn't send it anywhere itself. It opens a pre-filled GitHub issue that the user reviews and posts,
which needs a GitHub account. The VIN is included only if the user ticks the box.

It installs as a Home Screen app (Safari: Share → Add to Home Screen), using
`manifest.webmanifest` and the icons in `icons/`. The page makes no requests except to NHTSA: the
fonts are self-hosted in `fonts/` (Barlow Semi Condensed and B612 Mono, both under the SIL Open
Font License, with license files alongside).

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

### Listing history (optional, paid, command line only)

With a [MarketCheck](https://developers.marketcheck.com) API key, the command line adds the online
sale listings MarketCheck has recorded for the VIN: when and where it was listed, new or used,
asking prices and advertised mileage, grouped into each stay on the market, with a warning when
an advertised reading is lower than an earlier one. Put the key in `MARKETCHECK_API_KEY` or in
`~/.marketcheck_key` (readable only by you: `chmod 600`); `--no-history` skips it. The key is
never printed. MarketCheck's free plan allows 500 calls a month; paid plans charge $0.006 (USD)
a call, and a lookup makes one call per 50 listings, at most 4.

- It covers dealer websites (US since 2015, Canada since 2018) and Canadian private sellers
  since 2023, not classified sites such as Kijiji or AutoTrader.ca. "No listings" doesn't
  mean the car was never sold.
- Prices and readings are as advertised, not verified. MarketCheck calls the field `miles`,
  but Canadian dealers advertise km, so a listing in a province is read as km and CAD.
- It is not accident, service, ownership or lien history. The web page doesn't use it,
  because a key in a public page could be copied and billed.

Each section is fetched on its own. If one API is down, the report still comes back with that
section listed under `errors`.

Recalls are fetched by year/make/model, not by the individual VIN. Each recall's summary is then compared with the decoded VIN (drive type, engine, fuel, roof height), and recalls that explicitly name a different configuration are flagged as probably not applying (`mismatch` in the JSON). They are flagged, never dropped. They show which campaigns
apply to the model, not whether this particular car has been repaired. For a per-VIN open-recall
check, use the manufacturer's recall lookup or Transport Canada's.

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
  year, make and model go to NHTSA's recall, complaint and crash-rating services. The command
  line also sends the VIN (and your key) to MarketCheck, only when you've set a MarketCheck key. GitHub
  Pages, which hosts the page, sees each page request, including `?vin=` when you open a
  report link.
- **What stays on your device:** your records and the VINs you check, in this browser's
  storage, and any backup or CSV files you save. There are no accounts, cookies or
  analytics. Remove a vehicle from its page, or erase everything from the page's footer.
- **Feedback:** Send feedback puts your message (and the VIN, only if you tick the box) into
  a github.com address. Nothing is sent until you post it on GitHub, where issues are
  public. Report security problems privately instead (see `SECURITY.md`).
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
