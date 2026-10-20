# Production readiness: Car Report

Status of this app against every item in `PRODUCTION_STANDARD.md`. Update the rows a change touches in the same commit (see `CLAUDE.md`).

Last full review: 2026-10-15. Re-checked for the server and paid reports: 2026-10-20 (decision 16).

**160 items:** 80 met, 2 gaps, 29 need a person, 49 don't apply (each says why).

## What the owner needs to do

These need a decision or a setting only the owner can change. The details are in each row.

- **AUTH-03** MFA, plus a recovery path for the user who lost their phone
- **SEC-02** Every key that was ever pasted into a config file or chat has been rotated
- **SEC-03** Every installed package confirmed to exist and to be the one you meant
- **SEC-11** Least-privilege access for everyone, including AI agents holding production credentials
- **SEC-13** A penetration test before the enterprise customer's security team runs their own
- **COMP-08** Quarterly access reviews that someone signs off on
- **COMP-09** Terms and a privacy policy that match what the code actually does
- **COMP-10** Every account, domain and repo in the company's name, not the prototype builder's
- **OPS-17** Cost alerts, so a runaway loop shows up the same day and not on the invoice
- **OPS-18** A disaster recovery plan, written down and tested once a year
- **OBS-04** Alerts that page a human, tuned until they stop paging for nothing
- **OBS-07** An on-call rotation, and a person who picks up
- **BILL-04** Sales tax and VAT
- **PEOPLE-04** Deploys, rollbacks, servers and the cloud bill
- **PEOPLE-05** Answering the page at 3am when payments stop

## Work that needs people

Testing, review and judgment that an AI agent can help with but can't sign off.

- **OBS-09** Postmortems that change something
- **TEST-07** Testing on the five-year-old laptop and the old phone real users still have
- **TEST-08** Accessibility compliance (WCAG 2.1 AA)
- **UX-09** Translations, with dates and numbers formatted for each locale
- **CODE-02** Code review on every change
- **CODE-14** A bus factor higher than one
- **PEOPLE-01** Reading every line the AI wrote before it ships
- **PEOPLE-02** Designing the data model before the second customer breaks it
- **PEOPLE-03** Explaining why the AI's fix for one bug created two new ones
- **PEOPLE-06** Patching the framework the week a vulnerability goes public
- **PEOPLE-08** Testing what the AI says it tested
- **PEOPLE-10** Saying no to the feature that breaks three others
- **PEOPLE-12** Debugging the code when the AI that wrote it can't
- **PEOPLE-13** Remembering why it's built this way, a year from now

## Open gaps

- **OPS-05** Zero-downtime deploys
- **TEST-03** End-to-end tests for the flows that matter most (signup, checkout, the core task)

## Data and storage (DATA)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| DATA-01 | A schema someone designed, not one improvised table by table | Met | One record shape, built by `makeRecord` (`src/records.js`) for the form, imports and saved data. Stored under one key as `{ version, vehicles: { [VIN]: { name, records[] } } }`. |
| DATA-02 | Database migrations that run forward and roll back | Met | Saved data carries `version` (now 3). `readStore` upgrades version 1 (cost in dollars) and version 2 (readings in km only) and re-checks records; tests: *saved data upgrades from version 1*, *version 2 data upgrades to 3*. A newer version than the page knows is read but not written (decision 8). |
| DATA-03 | Migrations that don't lock the main table during business hours | Met | The server's database (Cloudflare D1, `server/schema.sql`) has three small tables: one row per purchase, daily counters and a day's listing counts. At that size a schema change takes milliseconds; new columns get defaults, so no table is rewritten. Saved data on phones upgrades on load in milliseconds (DATA-02). |
| DATA-04 | Indexes for the queries real data volumes need (5 million rows, not 50) | Met | The only lookup is by VIN key. Measured: 500 records render in 0.2 s, 20,000 stored vehicles in 93 ms (desktop Chromium). |
| DATA-05 | Connection pooling, so a traffic spike doesn't exhaust the database | N/A | No database connections to pool: the Worker reaches D1 through Cloudflare's binding, which manages that itself. |
| DATA-06 | Nightly backups | Met | Owners save backup files (in the app, through the share sheet to Files, iCloud Drive or Google Drive). The app also keeps a copy of saved data in the phone's settings store and restores it if iOS clears the web view's storage (`native.js`). On the website the page asks the browser to keep its storage. The records panel says when there's no backup or the records changed since the last one. |
| DATA-07 | Restores from those backups, tested | Met | Restore is tested (*a backup file restores what it saved*, *backup round trip…*) and was run in Chromium: save, clear storage, restore gave identical records. |
| DATA-08 | Point-in-time recovery, for the delete without a WHERE clause | Met | Unreadable saved data is copied to `vin-report:v1:unreadable` before anything writes over it, and the page says so. Recovery steps are in `docs/runbook.md`. |
| DATA-09 | Soft deletes, so an accidental delete is a support ticket and not an incident | Met | Deleting a record offers Undo for 8 seconds. Removing a vehicle or erasing all data asks for confirmation first. |
| DATA-10 | Validation on the server, not just in the form | Met | Validation lives in `src/records.js`, not the form: real calendar dates, expiry on or after the registration date, odometer (km or mi) and cost as plain amounts within limits, known provinces and US states, only own record types, short string ids. Tests cover each rule. The server checks everything it's sent itself: the VIN's format, the platform, the shape of the purchase reference, and a 4 KB body limit, before calling anything (test: *bad requests are refused before anything is called*). |
| DATA-11 | Timezones stored correctly, so the 9am reminder doesn't fire at 4am | Met | Dates are local calendar dates from the device's time zone (`localDate`), compared as date strings; checked in Chromium with clocks in Auckland and Los Angeles. |
| DATA-12 | Names with apostrophes work everywhere | Met | Apostrophes render, save, copy and back up correctly; all HTML output goes through `esc()`. |
| DATA-13 | Emoji, accents and right-to-left text work in every field | Met | Text is cut by code points; record fields and names use `dir="auto"` and `<bdi>`, so Arabic and Hebrew display in the right order next to numbers; full-width and zero-width characters in a VIN are cleaned up. |
| DATA-14 | Money stored as integers (0.1 + 0.2 ≠ 0.3 in floating point) | Met | Costs are stored as integer `costCents`, parsed from the digits; totals are exact (test: *costs are whole cents*). |
| DATA-15 | Currency, rounding and tax rules for every country you sell into | Met | Nothing is sold, so tax rules don't apply. Owner decided (2026-10-15): costs are Canadian dollars (decision 9). The form, CSV header and shared history say so; amounts are integer cents, and 89.99 and 89,99 parse the same. |
| DATA-16 | A data model that survives the second customer's "one small change" | Met | Owner decided (2026-10-15) to plan for US vehicles too. Each odometer reading keeps its own unit (km or mi), so a car that crosses the border keeps its history; rollback checks compare in km. The region list has US states (`US-XX`). Costs stay in Canadian dollars by decision. Saved data is version 3; older data upgrades on load (decision 10). |
| DATA-17 | Idempotency keys, so a retried payment doesn't charge twice | Met | Apple and Google take the payment, so the app never charges anything itself. Each store purchase has one ID; the server ties it to one VIN with a primary key (insert, or keep the first, then read back), so a retried or doubled claim never unlocks twice, and the app finishes the purchase with the store only after the server confirms it (tests: *unlocks one VIN*, *consumed once*; browser check of an interrupted purchase). Restoring the same backup twice adds nothing, including records without ids (test: *imports: ids, duplicates and re-imports*). |
| DATA-18 | Deduplication for the user who clicks submit four times | Met | Repeat taps on Check while a VIN is loading are ignored and don't add history entries (verified: 4 taps, 1 lookup). The record form closes on the first submit. |
| DATA-19 | Pagination that still works on page 400 | Met | Your vehicles lists every vehicle with records plus the 6 latest lookups. The timeline isn't paged; fine to about 2,000 records (1.3 s). Revisit if logs grow past that. |
| DATA-20 | Exports, because every customer eventually wants a spreadsheet | Met | Export CSV per vehicle (quoted, BOM for Excel, formula-safe; in French with semicolons and decimal commas, as French Excel expects), backup files (JSON) and copy as text. The CLI has `--json`. |
| DATA-21 | Imports that survive the CSV someone saved in 2009 | Met | Restore normalizes VIN keys, handles BOMs, keeps both records when two share an id, says how many were skipped, explains a non-backup file, refuses future versions and files over 5 MB. Tests cover each. |
| DATA-22 | Retention rules, and code that deletes what the contract says you'll delete | Met | Stated in the privacy policy (`privacy.html`, also in the app), the README and the footer: records, checked VINs and a website visitor's MarketCheck key stay on the device until removed (listing histories, for the 20 most recently checked VINs), and phone backups (iCloud or Google) can include them. Remove a vehicle on its page; erase everything from the footer, which also clears the app's copy. Lookups without records are pruned beyond the latest 50. |
| DATA-23 | Storage rules, so you stop paying to keep old temp files | Met | The backup download URL is revoked after use; old lookups are pruned; listing histories are capped at 20 VINs; a full quota gets its own message. |

## Accounts and access (AUTH)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| AUTH-01 | Login works with a plus sign in the email address | N/A | No accounts or logins. Feedback opens the person's own email app. |
| AUTH-02 | Password reset links that expire and work once | N/A | No passwords or accounts. |
| AUTH-03 | MFA, plus a recovery path for the user who lost their phone | Needs a person | No accounts in the app. Three logins can change production: the owner's GitHub account (every merge to `main` goes live on the website) and the Apple ID and Google account that publish the app. **Owner:** turn on 2FA for all three (passkey or authenticator app; the stores require it), store the recovery codes offline, and note the date here. |
| AUTH-04 | Sessions that time out, and a way to kill every session for one user | N/A | No sessions; the CLI keeps no state. Revoking GitHub sessions on a lost device is in `SECURITY.md`. |
| AUTH-05 | SSO for the enterprise customer who won't sign without it | N/A | No accounts to sign in to. |
| AUTH-06 | SAML, for IT teams that don't do magic links | N/A | No accounts or login flow. |
| AUTH-07 | SCIM, so an offboarded employee loses access immediately | N/A | No user accounts. Repo access at offboarding is covered by COMP-08. |
| AUTH-08 | Roles and permissions deeper than "admin" and "everyone else" | N/A | No accounts or roles; every visitor sees the same public data plus their own records. A second maintainer should get write or maintain, not admin. |
| AUTH-09 | Object-level checks, so user A can't read user B's data by changing an ID in the URL | Met | Server rows are reached only through a purchase the store confirms for this app: with just a VIN you get a count, never another person's report or purchase. Someone holding another person's purchase reference could fetch that one VIN's listings, at most 5 times a day; references aren't shown anywhere. `?vin=` loads public NHTSA data and only this device's own records. |
| AUTH-10 | Tenant isolation, so one customer's bug never shows another customer's records | N/A | No tenants. Server rows are per purchase, read only through a store-confirmed purchase (AUTH-09). The app runs from its own origin on each phone. Note for the website: every project site under pxkillah.github.io shares one origin and its storage; re-check before publishing another one there (or use a custom domain, COMP-10). |
| AUTH-11 | An admin "log in as this user" for support, with an audit trail on every use | N/A | No accounts to log in as; records never reach the owner. |
| AUTH-12 | Rate limits on login, so nobody can guess passwords at scale | N/A | No login to guess against. |
| AUTH-13 | Lockouts that stop attackers without locking out the CFO the night before the board meeting | N/A | No login to lock out. |

## Security (SEC)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| SEC-01 | Secrets kept out of the code, the repo and AI chat history | Met | No key, token or password in any file or in the history of any branch or PR (searched with `git log -p` on a mirror clone). The server's MarketCheck key and store credentials are Worker secrets set with `wrangler secret put` (`docs/server.md`), never in `wrangler.toml` or the repo; the server tests generate throwaway keys each run, and logs never carry keys, tokens or VINs (test: *logs never carry a VIN or a key*). The page itself holds no key: a visitor's own MarketCheck key is typed into a masked field, saved only in their browser, sent only to MarketCheck, and never written into the page (test: *the MarketCheck key is typed into a masked field and never part of the page*; a Chromium run checked the page's HTML after saving the key, loading a history and each error). The CLI's optional MarketCheck key is read from `MARKETCHECK_API_KEY` or `~/.marketcheck_key`, never from the repo, and is scrubbed from every error and the `--json` output (test: *the API key never appears in an error*). |
| SEC-02 | Every key that was ever pasted into a config file or chat has been rotated | Needs a person | Nothing in the repo to rotate. **Owner:** check whether any key (for example a MarketCheck API key) was ever pasted into a Claude session or environment setting, and rotate it if so. |
| SEC-03 | Every installed package confirmed to exist and to be the one you meant | Needs a person | The page has no packages; the four fonts match the published @fontsource 5.3.0 files byte for byte. `mobile/` adds Ionic's official Capacitor packages (`@capacitor/core`, `cli`, `ios`, `android`, `filesystem`, `share`, `preferences`) Capawesome's `@capacitor-mlkit/barcode-scanning`, which pulls in Google's ML Kit, and `@capacitor-community/in-app-review` (the store rating card); `@capgo/native-purchases` (Capgo, a third party, not Ionic) runs App Store and Google Play purchases; exact versions with integrity hashes are in `mobile/package-lock.json`. The server uses no packages; `wrangler` is run with `npx` on the owner's computer to deploy it. `npm audit` (2026-10-16) reports a moderate advisory in `uuid`, used by the Capacitor CLI's `xcode` package: a build tool on the Mac, not shipped in the app, and the only automatic fix downgrades the CLI, so it waits for Capacitor's update via Dependabot. Unconfirmed: the `.mcp.json` MarketCheck docs endpoint, which this environment couldn't reach. **Owner:** confirm it connects in a Claude Code session, or delete `.mcp.json` if MarketCheck isn't being evaluated. |
| SEC-04 | Dependency scanning, because AI-added libraries go unreviewed | Met | The page has no code dependencies. Dependabot alerts and security updates are on (confirmed by the owner, 2026-10-15); `.github/dependabot.yml` checks the workflow actions, npm in the root, and the app's packages in `mobile/` (grouped) monthly. |
| SEC-05 | Input sanitization everywhere a user can type | Met | Every input is validated in `src/`: VIN (`validateVin`; scans go through `vinFromScan` first), records (`makeRecord`, including imports), feedback (`feedbackUrl`). The server validates what it's sent (DATA-10). The MarketCheck key field takes 16 to 200 printable characters, and a saved listing history is re-checked (`isHistoryView`) before it's drawn (test: *a damaged saved view is not*). Only own record types count, so `constructor` is rejected. |
| SEC-06 | Protection against SQL injection, XSS, CSRF and the rest of the OWASP Top 10 | Met | All page HTML from API or user text goes through `esc()`; a Chromium run with hostile HTML in every field, and in MarketCheck's seller and city names, injected nothing. The CLI strips terminal control characters (test). The server uses only bound SQL parameters, never built strings, so no SQL injection; it has no cookies or sessions, so no CSRF; and a report needs a purchase the store confirms (tests cover forged, unknown, refunded and other apps' purchases). |
| SEC-07 | File uploads scanned, size-limited and stored where they can't execute | Met | The only upload is Restore: read locally, parsed as JSON, re-validated record by record, never executed or served. Files over 5 MB are refused. |
| SEC-08 | CORS rules that aren't "allow everything" | Met | The server sends CORS headers only to the app's own web view origins (`capacitor://localhost`, `https://localhost`), never `*` (test: *only the app gets CORS headers*). It doesn't rely on CORS for protection: purchases and limits are checked for every caller. |
| SEC-09 | Security headers on every response | Met | `index.html` sets a Content-Security-Policy meta tag (scripts and styles only from the page itself, network only to the two NHTSA hosts and `api.marketcheck.com`) and `no-referrer`; once deployed, the server's address is added to `connect-src` (`test/paid.test.js` and `check-release` check it), and the server's responses send `no-store` and `nosniff`; the app ships the same page and policy, and Capacitor's bridge is injected natively, not as an inline script. Every flow ran in Chromium with zero violations; `test/page.test.js` guards it. Limit: the website can't send real headers on GitHub Pages, so `frame-ancestors`, `nosniff` and Permissions-Policy aren't set there; the clickjacking risk is low. An Android System WebView too old to support document-start scripts falls back to an inline bridge, which this policy would block; WebView updates through Google Play, so this needs a long-unupdated phone (TEST-07). |
| SEC-10 | Encryption at rest and in transit | Met | Every request is HTTPS: constant https API bases, iOS App Transport Security on by default, Android mixed content off, and GitHub enforces HTTPS on github.io; the server is HTTPS-only on workers.dev and Cloudflare encrypts D1 at rest. At rest, records (and a website visitor's MarketCheck key) sit in the app's or browser's own storage on the person's device, protected by the device's lock and disk encryption rather than by the page. |
| SEC-11 | Least-privilege access for everyone, including AI agents holding production credentials | Needs a person | The "Protect main" ruleset (verified 2026-10-15) means nothing reaches the website without a pull request that passes `test (22)` and `test (24)`: no direct pushes, force pushes or deletion, and no bypass entries. App releases need the owner's Mac and store accounts. Remaining risks: GitHub doesn't enforce rulesets on private repositories on the free plan, so making the repository private (decision 15) turns this protection off unless the owner moves to GitHub Pro; Claude sessions act with the owner's GitHub identity, so a session could merge its own PR once the tests pass. **Owner decides:** GitHub Pro (US$4 a month) to keep the ruleset, or accept direct pushes; and whether to add a second maintainer and require one approval. |
| SEC-12 | Logs that record who did what, without passwords, tokens or card numbers | Met | The server's logs (Cloudflare Workers Logs) name what went wrong ("MarketCheck refused the key", "missing settings: …") without keys, tokens, VINs or IP addresses (test: *logs never carry a VIN or a key*). Website deploys are attributed by git history; server deploys by Cloudflare's deployment list. |
| SEC-13 | A penetration test before the enterprise customer's security team runs their own | Needs a person | No business customers, but the server now decides who gets a paid report. Its tests try forged, unknown, refunded, other-app and reused purchases, oversized and malformed requests, and the limits. **Owner decides:** have someone review `server/` for ways to get reports without paying before taking real money. |
| SEC-14 | Answers to the enterprise security questionnaire, with evidence behind each one | N/A | Free public tool; no buyer sends a questionnaire. Re-check if it's offered to an organisation. |
| SEC-15 | A vulnerability disclosure process for the day a stranger emails you one | Met | `SECURITY.md` asks for private reports by email to creport88@gmail.com, the support inbox the owner set up (2026-10-16), which also appears on the privacy and support pages. GitHub private vulnerability reporting is on too (verified 2026-10-15), while the repository is public. |
| SEC-16 | A plan for the day a laptop with production access is stolen | Met | "If a device with access is lost or stolen" checklist in `SECURITY.md`, now including the Apple and Google accounts and the Android upload key. Owner should read it once so it's familiar. It now includes Cloudflare and replacing the server's secrets. Its "MarketCheck keys" section covers a key saved on a lost device. |

## Compliance (COMP)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| COMP-01 | SOC 2: policies, evidence and an auditor, not a checkbox | N/A | No company or business customers. The server holds purchase references and VINs, not customer records. Re-check if the app is sold to businesses. |
| COMP-02 | HIPAA, the moment a single patient record touches the system | N/A | No health information; NHTSA's injury counts are public totals. |
| COMP-03 | A BAA with every vendor that touches that data, including the AI model provider | N/A | No health information and no AI model provider. |
| COMP-04 | Audit trails that show who viewed a record, not just who changed it | N/A | Records are never shared or synced. The server's purchase rows are read only by the server itself and, in the dashboard, by the owner; there is no other viewer to audit. |
| COMP-05 | PCI scope understood, and card numbers kept out of your database | Met | Out of PCI scope: Apple and Google take every payment in their own payment sheets. The app and the server never see a card number or bank detail, only the store's purchase reference. |
| COMP-06 | GDPR deletion requests that reach every table, backup and log | Met | Everything the app keeps is on the person's device and deletable there (Remove from this device; Erase all in the footer, which also clears the app's copy; uninstalling; on the website, Remove key and Erase all also clear the MarketCheck key and saved listing histories). VINs a visitor sends to MarketCheck with their own key are under their own MarketCheck account. On the server, the owner deletes a VIN's purchase rows on request (`docs/runbook.md`); listing counts and caller counters delete themselves within two days. Feedback arrives as email; the owner deletes it on request. |
| COMP-07 | Data residency for the customer whose contract says EU only | N/A | No contracts. What leaves the device: the VIN to NHTSA (US), and in the app the VIN and purchase reference to the Car Report server on Cloudflare (its D1 database is in one region, chosen by Cloudflare near where it was created), and from the server the VIN to MarketCheck (US); on the website, only with the visitor's own key, the VIN to MarketCheck. Feedback travels by the person's own email provider. |
| COMP-08 | Quarterly access reviews that someone signs off on | Needs a person | Production access: merging to `main` (website) and publishing app builds. That's the owner (sole admin), Claude sessions using the owner's GitHub connection, and whoever is added to App Store Connect or Play Console. **Owner:** once a quarter, review GitHub collaborators, GitHub Apps and OAuth apps (including Claude), deploy keys and tokens, the "Protect main" ruleset, and the users in App Store Connect and Play Console; note the date and outcome here. |
| COMP-09 | Terms and a privacy policy that match what the code actually does | Needs a person | `privacy.html` is the privacy policy (English and French), written from what the code does and linked from the app's footer; `support.html` is the support page; the README has a Privacy section, and it and the website footer say the VIN goes to MarketCheck only when a user with their own key asks; the CLI credits Transport Canada's Open Government Licence. `LICENSE`: MIT, copyright pxkillah (owner's choice, 2026-10-15). The contact for privacy requests is creport88@gmail.com (owner, 2026-10-16). The privacy policy, the iOS privacy manifest and the store answers (`mobile/store/listing.md`) were updated for the server and purchases (decision 16); the Google Play Data safety category for the VIN is the owner's call, noted there. **Owner:** host the two pages over HTTPS and put their addresses in both store listings (docs/app-release.md). |
| COMP-10 | Every account, domain and repo in the company's name, not the prototype builder's | Needs a person | The repo, the website and the store accounts are personal (pxkillah); no custom domain. An individual Apple developer account shows your legal name as the seller in the App Store. The Cloudflare account for the server is personal too. **Owner decides:** enrol in Apple and Google as an individual or as an organisation (needs a D-U-N-S number, shows the company name, and is easier to hand over later), and say which here. Moving the website strands saved records unless people back up and restore. |

## Infrastructure and delivery (OPS)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| OPS-01 | Dev, staging and production environments that match | Met | The website has no build step: the files served locally (`python3 -m http.server`) are exactly what GitHub Pages serves. The app builds from the same files (`npm run sync` in `mobile/`). Staging: preview branches locally, TestFlight and Play's closed testing for the app. The server runs the same code in the tests (Node) and on Cloudflare; there's no separate staging Worker, and store sandbox purchases (TestFlight, license testers) exercise the production server safely. |
| OPS-02 | Infrastructure as code, so the setup isn't in one person's memory | Met | The website is GitHub Pages serving `main` from the repo root. The iOS and Android projects are code in `mobile/`. The server is code in `server/` (`wrangler.toml`, `schema.sql`), set up by the steps in `docs/server.md`; only its secrets live outside the repo. CI, the live check, the app build and Dependabot are code in `.github/`. The store listings aren't code, so their text is kept in `mobile/store/listing.md`. |
| OPS-03 | A deploy pipeline that runs the tests before anything reaches customers | Met | CI runs `npm test` on Node 22 and 24 for every PR, and the "Protect main" ruleset requires both checks before merging (verified 2026-10-15; see SEC-11 for the private-repo caveat). `.github/workflows/mobile.yml` builds both apps on PRs that touch app or page code; the owner can make it a required check too. The server is deployed by the owner with `npx wrangler deploy` after its change is merged; its tests run in the same CI. |
| OPS-04 | One-click rollbacks | Met | Website: revert the merged PR with GitHub's Revert button; Pages redeploys in about a minute. App: store releases can't be undone, so release to 10% first (Play's staged rollout, the App Store's phased release), halt or pause on trouble, and ship a fixed build. Server: `npx wrangler rollback`. All are in `docs/runbook.md` and `docs/server.md`. |
| OPS-05 | Zero-downtime deploys | Gap | Pages swaps files atomically, but browsers cache them for 10 minutes, so a reload just after a deploy can pair the new `app.js` with old cached `src/` modules and break if their exports changed. Runbook says to keep `src/` exports backward compatible for one release. Fix (medium): version the module URLs. |
| OPS-06 | Feature flags, so code can ship without the feature | Met | The paid report ships switched off: until `REPORT_API` is set in `src/paid.js`, the app shows every report free, and `check-release` refuses a store build. The server's limits are settings in `wrangler.toml`. Unreleased work stays on branches. |
| OPS-07 | Autoscaling for the Monday morning spike | Met | The server is a Cloudflare Worker, which scales on its own; the free plan allows 100,000 requests a day (2 to 3 per report), and the paid plan (US$5 a month) lifts that. The website is static files on GitHub's CDN. |
| OPS-08 | A CDN, so the app loads fast far from the server | Met | GitHub Pages serves through its CDN. |
| OPS-09 | DNS, SSL certificates, and renewals that don't lapse on a Sunday | Met | `pxkillah.github.io` with HTTPS managed and renewed by GitHub. The hosted privacy and support pages must be on HTTPS too (both stores check). Re-check if a custom domain is added (COMP-10). |
| OPS-10 | Background job queues, so slow work doesn't freeze the page | N/A | No slow work: each server request is one store check and at most 4 MarketCheck calls, behind a loading state in the app. Android purchases are consumed inline once tied to a VIN. |
| OPS-11 | Retries with backoff, so one flaky API call doesn't become a lost order | Met | `src/http.js` retries network errors, 5xx and 429 with backoff (0.5 s, 1 s) and a 15 s timeout; `test/http.test.js`. |
| OPS-12 | A dead-letter queue for jobs that fail every retry | N/A | No background jobs. |
| OPS-13 | Cron jobs that don't run twice once there's a second server | Met | One scheduled job: the server's daily clean-up (Cloudflare cron, `17 4 * * *`), which only deletes old counters and counts, so running twice does no harm (test: *the daily clean-up*). The daily live check runs once on GitHub's scheduler. |
| OPS-14 | Caching, and clearing that cache when the data changes | Met | MarketCheck listing histories are kept per VIN on the device (the 20 most recent), because each call is billed to the visitor's key. The panel says when it was checked, Check again replaces it, and Remove from this device and Erase all clear it. The server keeps each VIN's free listing count for a day, so repeat checks cost nothing. NHTSA data isn't cached; every report is fetched fresh. Static-file caching is OPS-05. |
| OPS-15 | SPF, DKIM and DMARC, so transactional email doesn't land in spam | N/A | Sends no email. |
| OPS-16 | Bounce and complaint handling on every transactional email | N/A | Sends no email. |
| OPS-17 | Cost alerts, so a runaway loop shows up the same day and not on the invoice | Needs a person | Running the app costs nothing (GitHub Pages, free NHTSA APIs). The optional MarketCheck listing history, in the CLI or on the website, is billed to whoever's key it uses ($0.006 a call on a paid plan; free within 500 calls a month), at most 4 calls a lookup; the page calls only when the visitor taps and keeps the answer; MarketCheck's API Usage Alerts page sets email alerts. The paid report: each sale costs at most 4 MarketCheck calls, free counts are capped at 500 new ones a day overall and 20 per caller, and a bought report can be refreshed 5 times a day, so the most MarketCheck can cost without sales is about US$3 a day. Cloudflare's free plan costs nothing; over 100,000 requests a day it fails rather than bills. **Owner:** turn on MarketCheck's usage alerts for the server's key. The spend is AI-assisted development. **Owner:** set a monthly limit and spend alerts in your Claude account. |
| OPS-18 | A disaster recovery plan, written down and tested once a year | Needs a person | Written in `docs/runbook.md` (the app doesn't depend on GitHub once installed; serve the website from any host; people move records by backup). The Android upload key and passwords belong in the owner's password manager; Play App Signing holds the real signing key, and Apple can reissue certificates. The server's code is in the repo and redeploys to a new Cloudflare account with `docs/server.md`; its purchase rows are recoverable with D1 Time Travel (point-in-time restore) and, if lost, the app re-sends each saved purchase to be tied again. **Owner:** test it once a year by deploying a clone to a second host, and check the upload key backup opens. |
| OPS-19 | A second region, if the contract promises uptime one region can't deliver | N/A | No uptime commitment. |

## Observability and incidents (OBS)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| OBS-01 | Structured logs you can search at 3am | Met | The server logs to Cloudflare Workers Logs (`[observability]` in `wrangler.toml`), searchable in the dashboard, each line naming the problem (SEC-12). The app and website log nothing anywhere (decision 3). The CLI prints its report to the terminal. |
| OBS-02 | Error tracking that groups the same bug instead of sending 4,000 emails | N/A | An error-tracking SDK would break the promise to contact only NHTSA and, with a website visitor's own key, MarketCheck (decisions 3 and 13). Server errors are in Workers Logs (OBS-01). Errors are explained on screen, people report them with Send feedback, the live check catches API breakage, and both stores show crash reports from people who opted in to share diagnostics, with no SDK in the app. |
| OBS-03 | Uptime checks from outside your own network | Met | `.github/workflows/live-check.yml` calls the real NHTSA APIs daily, from GitHub's network. Once `REPORT_API` is set, the same daily check calls the server's `/v1/health`. The installed app needs NHTSA and, for paid reports, the server; the website also relies on GitHub Pages' availability. |
| OBS-04 | Alerts that page a human, tuned until they stop paging for nothing | Needs a person | GitHub emails the owner when the live check or CI fails. Cloudflare can email on Worker errors (Notifications → Workers). **Owner:** confirm Actions failure emails are on (GitHub Settings → Notifications → Actions). |
| OBS-05 | Dashboards for latency, error rate and throughput | Met | Cloudflare's dashboard shows the server's requests, errors and CPU time; App Store Connect and Play Console show sales and crashes. The app has no analytics, by design. |
| OBS-06 | Tracing for one slow request across every service it touches | N/A | One Worker calling Apple or Google and MarketCheck per request; its logs name which one failed, so there's nothing to trace across. |
| OBS-07 | An on-call rotation, and a person who picks up | Needs a person | One maintainer and no uptime promise. **Owner decides** who, if anyone, is on call; at minimum, act on live-check failure emails. |
| OBS-08 | Runbooks, so the on-call engineer knows what an alert means | Met | `docs/runbook.md`: live-check failures by kind, a store release that broke the app, rolling back the website, lost records, losing GitHub Pages. |
| OBS-09 | Postmortems that change something | Needs a person | Template in `docs/runbook.md`. No incidents yet; writing them up is the owner's practice. |
| OBS-10 | A status page customers check before they email you | N/A | No uptime promise; the app says when NHTSA or the Car Report server isn't responding, and a bought report waits safely until it is. |

## Testing (TEST)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| TEST-01 | Unit tests written by someone who knows what the logic should do | Met | 108 offline tests cover every module in `src/` and the server (`test/server.test.js` runs the Worker on node:sqlite with Apple, Google and MarketCheck stubbed, and checks the ES256 and RS256 signatures with generated keys), including retries, error kinds, parsers, records rules, storage upgrades, units, and English/French message parity. They were written by the AI that wrote the code; PEOPLE-08 covers human review. |
| TEST-02 | Integration tests for every third-party API you depend on | Met | `scripts/live-check.js` checks every NHTSA endpoint against the sample VIN, daily and on every pull request that changes the code that talks to NHTSA (`.github/workflows/live-check.yml`). Offline tests cover the documented formats, including the App Store Server API and Play Developer API answers; those have no live check because they need the owner's store credentials, so test purchases in TestFlight and Play's license testing are the live check before release. MarketCheck is optional and paid, so it has no live check (one would need a key as an Actions secret and costs a call a run); its documented format is covered offline, and a change shows as an error, never as no listings. First real run passed on PR #8 (2026-10-15): 24 recalls, 2,013 complaints, 4 rated versions. |
| TEST-03 | End-to-end tests for the flows that matter most (signup, checkout, the core task) | Gap | No automated end-to-end test in the repo. The flows (lookup, scan, add record, undo, backup, restore, CSV, feedback, remove, erase) were checked with Playwright scripts during development, including the app's native paths through a stand-in for Capacitor's bridge, but the scripts weren't kept. The paid report (locked report, buy, cancel, interrupted purchase settled at launch, credit, refund, example, French, Erase all) was checked the same way against the real Worker code (2026-10-20). `mobile.yml` proves the apps compile, not that they work. Fix (medium): add Playwright tests to CI, which adds a dev dependency. |
| TEST-04 | Load testing before the launch email goes out | N/A | Static files on a CDN and a Worker that scales on its own; the limit that matters is MarketCheck's, capped by the server's daily limits (OPS-17). |
| TEST-05 | Test data that looks like production without being production data | Met | Tests use NHTSA's published sample VIN and minimal payloads in the documented formats. No real user data exists outside visitors' browsers. |
| TEST-06 | Regression tests, so fixing bug 41 doesn't bring back bug 12 | Met | Each bug fixed in this pass has a test that fails on the old code (checked by running the new tests against it). |
| TEST-07 | Testing on the five-year-old laptop and the old phone real users still have | Needs a person | Fixed: every lookup failed on Safari before 16 (iOS 15). The app needs iOS 15.5 or Android 7. **Still needed:** run the app on a real iPhone and Android phone before release: scan a real VIN label, save and restore a backup, share a CSV, open feedback in the mail app. Also try an older phone (iOS 15 or 16; Android with an old System WebView, SEC-09). |
| TEST-08 | Accessibility compliance (WCAG 2.1 AA) | Needs a person | axe-core finds no WCAG 2.1 A or AA violations on the home page, a report and both forms, in English and French, light and dark, at 390 and 320 px wide (2026-10-15). Nothing spills sideways at 320 px. Automated checks catch only part. Known limit: with the phone's text size at 150%, the complaint figures and records panel still get wider than the screen. **Needed:** one pass with VoiceOver or TalkBack by a person. |

## Billing (BILL)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| BILL-01 | Subscriptions, upgrades, downgrades and proration | N/A | No subscriptions or plans: one consumable purchase per VIN, priced in the stores. |
| BILL-02 | Failed-payment retries and dunning emails | N/A | No subscriptions to retry; Apple and Google handle declined payments in their own sheets. A pending Google Play payment opens the report's listings once it clears (test: *pending*). |
| BILL-03 | Invoices with the customer's PO number on them | N/A | No invoices or business customers; the stores email buyers their receipts. |
| BILL-04 | Sales tax and VAT | Needs a person | Apple and Google collect and remit sales tax (including GST/HST and QST in Canada) on app sales as the seller of record. **Owner:** complete the tax forms in App Store Connect and Play Console, and ask an accountant about income tax on the proceeds. |
| BILL-05 | Refunds, credits and partial refunds | Met | Refunds are made by Apple or Google (`support.html` says where). The server checks the purchase with the store on every request, so a refunded purchase stops loading listings (tests: *refunded*), and the app locks that report again. |
| BILL-06 | Usage metering that matches what you bill, to the cent | Met | The price is fixed per report; the paid upstream (MarketCheck) is at most 4 calls per report and capped per day (OPS-17), and its dashboard shows usage to compare with the server's one row per paid purchase. |
| BILL-07 | Annual contracts with custom terms | N/A | No contracts. |
| BILL-08 | Revenue reports finance can reconcile | Met | App Store Connect (Payments and Financial Reports) and Play Console (Earnings reports) report every sale, refund and fee; the server's `unlocks` table has one dated row per paid purchase, by platform, to reconcile them against. |

## APIs and integrations (API)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| API-01 | Incoming webhooks verify signatures | N/A | Receives no webhooks: refunds are caught by checking the store on each request instead of App Store Server Notifications or Google's real-time notifications. |
| API-02 | Outgoing webhooks retry, with a log of every failed delivery | N/A | Sends no webhooks. |
| API-03 | A versioned API, so it can change without breaking customers' integrations | Met | The server's paths are versioned (`/v1/...`), and the app is its only client. The CLI's `--json` output is unversioned; re-check if anyone builds on it. |
| API-04 | API keys customers can create and revoke | N/A | No API keys to issue. |
| API-05 | API rate limits that protect you without blocking real integrations | Met | Free counts are limited per caller (20 a day) and overall (500 a day); a bought report can be refreshed 5 times a day; each limit is a setting (tests: *limited per caller and in total*, *only a few times a day*). |
| API-06 | A plan for the day a third-party API changes its response format without notice | Met | Parsers throw a `FormatError` instead of returning empty lists, so a changed NHTSA format shows as "couldn't load", never "no recalls" (tests). MarketCheck's parser does the same (test: *a changed MarketCheck format is an error*), and the page says MarketCheck sent a format it doesn't recognize. The daily live check reports it; the runbook says what to do. |
| API-07 | OAuth token refresh, because tokens expire at the worst moment | Met | Google access tokens are reused until a minute before they expire, then replaced (test: *the access token is reused*); Apple's API token is signed fresh for each request. |
| API-08 | A sandbox where customers can test their integration | N/A | No customer integrations. |

## AI features (AI)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| AI-01 | Protection against prompt injection in every field that reaches the model | N/A | The app makes no AI model calls. |
| AI-02 | Customer and patient data kept out of prompts that leave your network | N/A | The app makes no AI model calls. |
| AI-03 | A model spend cap per customer | N/A | The app makes no AI model calls. |
| AI-04 | Evals, so you notice when a model update makes answers worse | N/A | The app makes no AI model calls. |
| AI-05 | A fallback for when the model provider is down | N/A | The app makes no AI model calls. |
| AI-06 | A migration plan for when the model is deprecated | N/A | The app makes no AI model calls. |
| AI-07 | Prompt and output logs for debugging, minus what you're not allowed to keep | N/A | The app makes no AI model calls. |
| AI-08 | A human approval step for anything the AI does that can't be undone | N/A | The app makes no AI model calls. For development: changes made by AI agents reach visitors only through pull requests the owner merges (SEC-11, CODE-02). |

## User experience (UX)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| UX-01 | Pages that load on hotel wifi | Met | About 200 KB before compression for the page, fonts and scripts, no CDN or analytics requests, and a loading skeleton while NHTSA answers (15 s timeout). |
| UX-02 | Empty, loading and error states on every screen | Met | Loading skeleton; empty states for no recalls, complaints, ratings and records; the listing history panel has no-key, ready, loading, no-ads and error states, and keeps a saved history on screen when a new check fails; each section fails on its own with an explanation (checked in Chromium with NHTSA down and with a changed format). |
| UX-03 | Error messages a person can act on, not "something went wrong" | Met | Errors say what happened and what to do: NHTSA unreachable, slow, down, refusing, or sending a changed format; and "didn't recognize this VIN" only when that's true. MarketCheck errors say whether the key was refused, is out of calls, or MarketCheck is unreachable, slow, down or sending a changed format. |
| UX-04 | Forms that keep what people typed when one field fails validation | Met | The record and feedback forms keep everything typed when validation fails, and the feedback draft survives closing the form. |
| UX-05 | Emails that render in every mail client your users have | N/A | Sends no email. |
| UX-06 | Notifications people can turn off | N/A | Sends no notifications. |
| UX-07 | Undo | Met | Undo after deleting a record; confirmation before removing a vehicle or erasing all data. |
| UX-08 | Keyboard navigation and screen reader support | Met | Every control is reachable by keyboard; forms are native modal dialogs; the mileage chart has an arrow-key readout; when the listing history panel redraws, focus moves to its heading instead of being lost. A screen-reader pass is TEST-08. |
| UX-09 | Translations, with dates and numbers formatted for each locale | Needs a person | English and French (Canada): every page string, dates (15 oct. 2026, 1er), numbers and money (89,99 $), km or mi, province and state names, CSV and shared history, the privacy and support pages, the store listing and screenshots. Language follows the device, with a switch that's remembered; `?lang=fr` works on the website. NHTSA's own text stays in English and is marked `lang="en"`. Tests check both languages have every key and placeholder. **Needed:** a fluent Quebec French speaker to review the wording; it was translated by the AI that wrote the code. |
| UX-10 | A back button that does what people expect | Met | Back closes an open form instead of leaving the page behind it; lookups don't add duplicate history entries; `?vin=` links work. |

## Code, docs and team (CODE)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| CODE-01 | Code a human can read | Met | Small, commented modules in `src/`; the page is split into markup, styles and script. |
| CODE-02 | Code review on every change | Needs a person | The ruleset makes every change go through a pull request, but nobody besides the owner reviews them. See PEOPLE-01. |
| CODE-03 | A branching strategy, so two people don't overwrite each other | Met | Work happens on branches and reaches `main` through pull requests, enforced by the "Protect main" ruleset and stated in `CLAUDE.md`. |
| CODE-04 | Monthly dependency upgrades, never two major versions behind | Met | The page has no npm dependencies. `mobile/` has Capacitor and six plugins, pinned in `package-lock.json`; Dependabot checks them, the workflow actions and the root monthly. |
| CODE-05 | Framework and runtime upgrades before the old version loses security patches | Met | Node 22 or later (18 and 20 no longer get security fixes); CI tests 22 and 24. |
| CODE-06 | Dead code from earlier attempts deleted | Met | No unused functions in `src/` or `app.js` (checked 2026-10-15). A few constants are exported but only used inside their module. |
| CODE-07 | No 2,000-line files that everything gets appended to | Met | `index.html` (1,426 lines) is split into `index.html`, `app.css` and `app.js`; the largest file is `app.js` at about 1,400 lines, with the paid report as its own section; split that section out next time it grows. |
| CODE-08 | Architecture decisions written down, with the reasons | Met | `docs/decisions.md`. |
| CODE-09 | A README that gets a new engineer running locally in under an hour | Met | README "Run it locally": clone, `npm test`, serve; no install step. The app: `cd mobile && npm ci && npm run sync`, then Xcode or Android Studio (`docs/app-release.md`). |
| CODE-10 | Documentation for whoever inherits this | Met | README, `CLAUDE.md`, `docs/decisions.md`, `docs/runbook.md`, `docs/app-release.md`, `mobile/store/listing.md`, `docs/marketing/`, `SECURITY.md` and `CHANGELOG.md`. |
| CODE-11 | An admin panel for the ops team | N/A | No users to administer. The few server tasks (deleting a VIN's rows, checking purchases) are D1 commands in `docs/runbook.md`. |
| CODE-12 | Support tooling, so support can answer questions without pinging engineering | Met | `docs/runbook.md` answers the support cases for paid reports (paid but nothing opened, refunds, deletion), and `support.html` answers buyers directly; no engineering needed for any of them. |
| CODE-13 | A changelog customers can read | Met | `CHANGELOG.md`. |
| CODE-14 | A bus factor higher than one | Needs a person | One owner. The docs reduce what lives in one head; a second maintainer with write access would raise the bus factor. |

## People (PEOPLE)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| PEOPLE-01 | Reading every line the AI wrote before it ships | Needs a person | Today no one but the AI reads the code before it ships. Needed: a senior engineer reviewing PRs. |
| PEOPLE-02 | Designing the data model before the second customer breaks it | Needs a person | No database. The records model's open decisions (DATA-15, DATA-16) are made and built (decisions 9 and 10); a backend engineer's review of it is still worth having. |
| PEOPLE-03 | Explaining why the AI's fix for one bug created two new ones | Needs a person | Same reviewer as PEOPLE-01. |
| PEOPLE-04 | Deploys, rollbacks, servers and the cloud bill | Needs a person | The server is the first cloud service: deploys (`wrangler deploy`), rollbacks and its secrets are the owner's (`docs/server.md`); Cloudflare's free plan has no bill. Website deploys are merges to `main`; app releases are uploads from the owner's Mac. **Owner decides:** whether anyone else should be able to deploy or roll back the server. |
| PEOPLE-05 | Answering the page at 3am when payments stop | Needs a person | Payments now run through the app: if the server stops, buyers' purchases wait safely but their listings don't load. **Owner decides:** who notices (Cloudflare error emails, OBS-04) and how fast they act. |
| PEOPLE-06 | Patching the framework the week a vulnerability goes public | Needs a person | The page has no framework or dependencies; the app has Capacitor, whose yearly major versions track Apple's and Google's requirements (Google Play makes apps target a recent Android each year). Browsers, Node and the workflow actions also get advisories. Owner acts on Dependabot PRs and alerts. |
| PEOPLE-07 | Walking an auditor through how sensitive data moves | N/A | No regulated or sensitive data held anywhere but the visitor's own device. |
| PEOPLE-08 | Testing what the AI says it tested | Needs a person | All testing so far, including the browser checks, was done by the AI that wrote the code. Needed: a person testing on real devices (TEST-07, TEST-08). |
| PEOPLE-09 | Running a migration on a live database without losing a row | N/A | No live database; saved data upgrades in the browser (DATA-02). |
| PEOPLE-10 | Saying no to the feature that breaks three others | Needs a person | The owner, as the only maintainer. |
| PEOPLE-11 | Turning "works on my laptop" into "works for every customer at once" | N/A | Static files on a CDN and a Worker that scales per request; the only shared state is the server's small purchase table. |
| PEOPLE-12 | Debugging the code when the AI that wrote it can't | Needs a person | Needed when an AI-written bug resists AI debugging. |
| PEOPLE-13 | Remembering why it's built this way, a year from now | Needs a person | `docs/decisions.md` and `CHANGELOG.md` record the why; the owner is the person who was there. |
