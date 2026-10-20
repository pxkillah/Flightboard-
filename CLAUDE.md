# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`vehicle-report` (the repo name "Flightboard-" is unrelated to its contents) builds a Carfax-style VIN report from free public government APIs: NHTSA vPIC, NHTSA recalls, complaints and NCAP ratings, and Transport Canada recalls. It ships as a Node CLI and as a single static web page. It has **no dependencies and no build step**, and needs no API keys (an optional MarketCheck key adds paid listing history; it's always the user's own key, never one in the repo or the published page). It needs Node ≥ 22 (ES modules, global `fetch`, `node:test`). CI tests Node 22 and 24.

## Commands

```
npm test                                   # all tests (node --test test/*.test.js), fully offline
node --test test/recallMatch.test.js       # one test file
node --test --test-name-pattern="<regex>" test/*.test.js   # tests matching a name
node bin/vehicle-report.js <VIN> [--json] [--force] [--no-ratings] [--no-complaints] [--no-history]
node scripts/live-check.js                 # real NHTSA calls; runs daily in GitHub Actions and on PRs that change NHTSA code
```

There is no linter or formatter configured. `.github/workflows/ci.yml` runs `npm test` on pushes to main and on pull requests. Work on a branch and open a pull request: GitHub Pages publishes `main` to visitors as soon as it changes. To try the web page, serve the repo root over HTTP (for example `python3 -m http.server`), because ES module imports don't load from `file://`. `?vin=<VIN>` runs a lookup on load. GitHub Pages serves `main` from the root.

## Architecture

The same modules in `src/` run in both Node and the browser. The page is `index.html` (markup), `app.css` and `app.js`; `app.js` imports the `src/` modules directly as ES modules, so `src/` must stay browser-compatible: no Node built-ins, no bare package imports. `index.html` sets a Content-Security-Policy meta tag (GitHub Pages can't send headers): scripts only from the site itself, network only to the two NHTSA hosts and `api.marketcheck.com`. So no inline `<script>`, no `on*=` attributes and no third-party URLs; `test/page.test.js` checks this.

- `src/report.js`: `buildReport(vin, { fetch, include, force })` validates the VIN, decodes it with vPIC (which supplies year, make and model), then fetches each section in parallel. **Each section fails on its own**: an error goes into `report.errors[section]` and does not fail the whole report. `include.<section> === false` skips a section. `formatReport` renders the CLI text.
- `src/sources/*.js`: one module per API. Each exposes pure `parse*` functions, which the tests exercise, alongside fetch wrappers.
- `src/sources/marketcheck.js`: MarketCheck History by VIN (listing history). Paid, so `buildReport` runs the `listingHistory` section only when given `marketcheckKey`; the CLI reads it from `MARKETCHECK_API_KEY` or `~/.marketcheck_key`. The page calls `history` itself, only when the visitor taps Show listing history, with the key they saved in `localStorage` (`vin-report:v1:marketcheck`); it keeps each result as a `historyView` per VIN (`vin-report:v1:listings`) and checks it with `isHistoryView` when read back. The key is in the query string, so `history` scrubs it from errors, and the page never writes it into the DOM. A listing in a Canadian province is read as km and CAD (decision 12; the page, decision 13).
- `src/dates.js`: `isoDate` turns each source's date order (NHTSA d/m/y, Transport Canada m/d/y) into YYYY-MM-DD; parsers return dates in that form.
- `src/http.js`: `getJson` handles retries with backoff on 5xx/429/network errors, the timeout, and 404 → `null`. It omits `User-Agent` in the browser so requests don't trigger a CORS preflight.
- `src/recallMatch.js`: recalls are looked up by year/make/model, not by VIN. `recallMismatch` compares each recall's text with the decoded vehicle (drive type, engine, fuel, roof height) and returns reasons it probably doesn't apply. Mismatched recalls are **flagged (`mismatch`), never dropped**, and a check only fires on an explicit contradiction.
- `src/records.js`: the pure logic behind the web page's "My records" log (service, odometer and registration entries per VIN): validation, odometer-rollback and registration-expiry warnings, history text, and backup parse/merge. Storage is the caller's job: `app.js` keeps it in `localStorage` under `vin-report:v1` (the data carries its own `version`; `readStore` upgrades older data), and nothing is uploaded. Costs are integer cents in Canadian dollars. Each odometer reading stores `km` or `mi` in its own unit; checks compare via `kmOf`. Regions are province codes or `US-` plus a state code. The store is version 3 (`STORE_VERSION`); a change to saved shapes needs a new version and an upgrade in `readStore`.
- `src/i18n.js`: every user-facing string, in English and French (`MESSAGES.en` / `MESSAGES.fr`), plus `t(lang, key, params)` and locale formatters for dates, numbers, distances and money. `src/regions.js` has province and state names. Add any new string to both languages: `test/i18n.test.js` checks key and placeholder parity, and `test/page.test.js` checks every `data-i18n` key the page uses exists. The `src/` functions that produce text take a `lang` option (default `'en'`).
- `src/feedback.js`: `feedbackUrl` validates the feedback form and builds a pre-filled `mailto:` URL to `SUPPORT_EMAIL`. The page opens that URL rather than sending feedback itself, which keeps the page's network list short. `SUPPORT_EMAIL` is the owner's support inbox (creport88@gmail.com); if it's ever emptied, the page hides Send feedback.
- `native.js` (repo root, beside `app.js`): the phone-app features. In the app, Capacitor injects `window.Capacitor`, and these functions call native plugins through `Capacitor.nativePromise(plugin, method, options)` with no bundler: the barcode scanner, saving files via the share sheet, a copy of saved data in the Preferences plugin, and the store rating card (asked once after the third saved record, then at most every 4 months). On the website each one falls back to the browser. `vinFromScan` (`src/vin.js`) picks the VIN out of what a scan read.
- `src/vin.js`: VIN normalization and the check-digit calculation (49 CFR 565).

The web page calls `buildReport` with `include: { recallsCanada: false }` and links to Transport Canada instead of fetching it. The README says the page makes no requests except to NHTSA, and to MarketCheck when a visitor with their own key asks; the fonts in `fonts/` are self-hosted to keep it that way. Don't add CDN or other third-party requests to the page. `manifest.webmanifest` and `icons/` make the page installable as a Home Screen app.

The page is also the **Car Report** iOS and Android app (`com.pxkillah.carreport`). `mobile/` holds the Capacitor projects and is the only place with npm dependencies; keep the repo root dependency-free. `mobile/scripts/copy-web.js` copies the page into `mobile/www/` (git-ignored), and `npm run sync` in `mobile/` copies it and updates the native projects. Any new file the page loads must be added to the copy list. `privacy.html` and `support.html` are self-contained pages the owner hosts for the store listings; keep them in step with what the app does. Store text and screenshots are in `mobile/store/`, and the release steps (done by the owner on a Mac) in `docs/app-release.md`. `mobile/scripts/check-release.js` must pass before a store upload. `.github/workflows/mobile.yml` builds both apps, unsigned, on PRs that touch the app or page code. This container can't download the Android SDK, so rely on that workflow to compile them.

## Tests

The tests stub `fetch` (`stubFetch` in `test/report.test.js`) with minimal payloads in each API's documented response format. They check parsing and wiring, not live API behaviour. Pass `{ fetch }` to `buildReport` or the source functions to inject a stub.

## Production standard

The owner requires every app to follow `PRODUCTION_STANDARD.md`. This app's status against each item is in `docs/production-readiness.md`.

- Before finishing any change, check the standard's items that the change touches, and update their rows in `docs/production-readiness.md` in the same commit.
- Many items are N/A here because the app has no accounts, server, database, payments, email or AI model. Each N/A row names the missing capability. If a change adds one of those capabilities, re-check every row whose reason names it before the change ships.
- Don't add machinery an item doesn't need here. Do close gaps that apply.
- Items marked "Needs a person" stay that way until a person signs off. Don't mark them met yourself.

## Project constraints (from README)

- Use only legitimate public data. Don't scrape carfax.ca or get around its paywall. Accident, lien, ownership and service history are deliberately out of scope (odometer readings appear only as advertised in MarketCheck listings, with the user's own key), and the README lists where that data legitimately lives.
- Recall results show which campaigns apply to the model, not whether this particular car has been repaired. Keep the wording consistent with that.

## MCP

`.mcp.json` configures a `marketcheck-docs` HTTP MCP server (MarketCheck API docs) for Claude Code sessions.
