# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`vehicle-report` (the repo name "Flightboard-" is unrelated to its contents) builds a Carfax-style VIN report from free public government APIs: NHTSA vPIC, NHTSA recalls, complaints and NCAP ratings, and Transport Canada recalls. It ships as a Node CLI and as a single static web page. It has **no dependencies, no build step and no API keys**, and needs Node ≥ 18 (ES modules, global `fetch`, `node:test`).

## Commands

```
npm test                                   # all tests (node --test test/*.test.js), fully offline
node --test test/recallMatch.test.js       # one test file
node --test --test-name-pattern="<regex>" test/*.test.js   # tests matching a name
node bin/vehicle-report.js <VIN> [--json] [--force] [--no-ratings] [--no-complaints]
```

There is no linter or formatter configured. To try the web page, serve the repo root over HTTP (for example `python3 -m http.server`), because ES module imports don't load from `file://`. `?vin=<VIN>` runs a lookup on load. GitHub Pages serves `main` from the root.

## Architecture

The same modules in `src/` run in both Node and the browser. `index.html` imports them directly with `<script type="module">` (`./src/report.js`, `./src/vin.js`, `./src/records.js`, `./src/feedback.js`), so `src/` must stay browser-compatible: no Node built-ins, no bare package imports.

- `src/report.js`: `buildReport(vin, { fetch, include, force })` validates the VIN, decodes it with vPIC (which supplies year, make and model), then fetches each section in parallel. **Each section fails on its own**: an error goes into `report.errors[section]` and does not fail the whole report. `include.<section> === false` skips a section. `formatReport` renders the CLI text.
- `src/sources/*.js`: one module per API. Each exposes pure `parse*` functions, which the tests exercise, alongside fetch wrappers.
- `src/http.js`: `getJson` handles retries with backoff on 5xx/429/network errors, the timeout, and 404 → `null`. It omits `User-Agent` in the browser so requests don't trigger a CORS preflight.
- `src/recallMatch.js`: recalls are looked up by year/make/model, not by VIN. `recallMismatch` compares each recall's text with the decoded vehicle (drive type, engine, fuel, roof height) and returns reasons it probably doesn't apply. Mismatched recalls are **flagged (`mismatch`), never dropped**, and a check only fires on an explicit contradiction.
- `src/records.js`: the pure logic behind the web page's "My records" log (service, odometer and registration entries per VIN): validation, odometer-rollback and registration-expiry warnings, history text, and backup parse/merge. Storage is the caller's job: `index.html` keeps it in `localStorage`, and nothing is uploaded.
- `src/feedback.js`: `feedbackUrl` validates the feedback form and builds a pre-filled GitHub new-issue URL. The page opens that URL rather than posting feedback itself, which keeps the no-requests-except-NHTSA rule.
- `src/vin.js`: VIN normalization and the check-digit calculation (49 CFR 565).

The web page calls `buildReport` with `include: { recallsCanada: false }` and links to Transport Canada instead of fetching it. The README says the page makes no requests except to NHTSA, and the fonts in `fonts/` are self-hosted to keep it that way. Don't add CDN or third-party requests to `index.html`. `manifest.webmanifest` and `icons/` make the page installable as a Home Screen app.

## Tests

The tests stub `fetch` (`stubFetch` in `test/report.test.js`) with minimal payloads in each API's documented response format. They check parsing and wiring, not live API behaviour. Pass `{ fetch }` to `buildReport` or the source functions to inject a stub.

## Production standard

The owner requires every app to follow `PRODUCTION_STANDARD.md`. This app's status against each item is in `docs/production-readiness.md`.

- Before finishing any change, check the standard's items that the change touches, and update their rows in `docs/production-readiness.md` in the same commit.
- Many items are N/A here because the app has no accounts, server, database, payments, email or AI model. Each N/A row names the missing capability. If a change adds one of those capabilities, re-check every row whose reason names it before the change ships.
- Don't add machinery an item doesn't need here. Do close gaps that apply.
- Items marked "Needs a person" stay that way until a person signs off. Don't mark them met yourself.

## Project constraints (from README)

- Use only legitimate public data. Don't scrape carfax.ca or get around its paywall. Accident, lien, ownership and odometer history are deliberately out of scope, and the README lists where that data legitimately lives.
- Recall results show which campaigns apply to the model, not whether this particular car has been repaired. Keep the wording consistent with that.

## MCP

`.mcp.json` configures a `marketcheck-docs` HTTP MCP server (MarketCheck API docs) for Claude Code sessions.
