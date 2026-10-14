# vehicle-report

A command-line VIN lookup that builds a Carfax-style vehicle report from **free, public
government data**. It needs no API keys and has no dependencies (Node ≥ 18).

```
$ node bin/vehicle-report.js 1HGCM82633A004352
$ node bin/vehicle-report.js 1HGCM82633A004352 --json
```

## Web page (works on a phone)

`index.html` is the same report as a mobile-friendly web page. It runs entirely in the browser
and calls the government APIs directly, so it needs no server. To host it free with GitHub Pages:
Settings → Pages → Source "Deploy from a branch" → `main` / `(root)` → Save. The page is then at
`https://<user>.github.io/<repo>/`, and `?vin=<VIN>` in the URL runs a lookup straight away.

## What it pulls

| Section | Source | Endpoint |
|---|---|---|
| VIN check digit | local (49 CFR 565) | — |
| Year / make / model / trim / engine / plant | NHTSA vPIC | `vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}` |
| Canadian recalls | Transport Canada recall DB | `data.tc.gc.ca/v1.3/api/eng/vehicle-recall-database/...` |
| US recalls (incl. "do not drive" flags) | NHTSA | `api.nhtsa.gov/recalls/recallsByVehicle` |
| Owner complaints (crash/fire/injury counts, top components) | NHTSA | `api.nhtsa.gov/complaints/complaintsByVehicle` |
| Crash-test stars | NHTSA NCAP | `api.nhtsa.gov/SafetyRatings/...` |

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

## Tests

```
npm test
```

The tests run offline against stubbed responses in each API's documented format.
