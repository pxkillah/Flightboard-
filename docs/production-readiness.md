# Production readiness: VIN Report

Status of this app against every item in `PRODUCTION_STANDARD.md`. Update the rows a change touches in the same commit (see `CLAUDE.md`).

Last full review: 2026-10-15.

**160 items:** 63 met, 2 gaps, 25 need a person, 70 don't apply (each says why).

## What the owner needs to do

These need a decision or a setting only the owner can change. The details are in each row.

- **AUTH-03** MFA, plus a recovery path for the user who lost their phone
- **SEC-02** Every key that was ever pasted into a config file or chat has been rotated
- **SEC-03** Every installed package confirmed to exist and to be the one you meant
- **SEC-11** Least-privilege access for everyone, including AI agents holding production credentials
- **COMP-08** Quarterly access reviews that someone signs off on
- **COMP-09** Terms and a privacy policy that match what the code actually does
- **COMP-10** Every account, domain and repo in the company's name, not the prototype builder's
- **OPS-17** Cost alerts, so a runaway loop shows up the same day and not on the invoice
- **OPS-18** A disaster recovery plan, written down and tested once a year
- **OBS-04** Alerts that page a human, tuned until they stop paging for nothing
- **OBS-07** An on-call rotation, and a person who picks up

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
| DATA-03 | Migrations that don't lock the main table during business hours | N/A | No database or server: one person's data in their own browser, upgraded in a few milliseconds on load. |
| DATA-04 | Indexes for the queries real data volumes need (5 million rows, not 50) | Met | The only lookup is by VIN key. Measured: 500 records render in 0.2 s, 20,000 stored vehicles in 93 ms (desktop Chromium). |
| DATA-05 | Connection pooling, so a traffic spike doesn't exhaust the database | N/A | No database or server; each browser and CLI process calls NHTSA directly. |
| DATA-06 | Nightly backups | Met | Owners save backup files. The page asks the browser to keep its storage once a record is saved, and the records panel says when there's no backup or the records changed since the last one. |
| DATA-07 | Restores from those backups, tested | Met | Restore is tested (*a backup file restores what it saved*, *backup round trip…*) and was run in Chromium: save, clear storage, restore gave identical records. |
| DATA-08 | Point-in-time recovery, for the delete without a WHERE clause | Met | Unreadable saved data is copied to `vin-report:v1:unreadable` before anything writes over it, and the page says so. Recovery steps are in `docs/runbook.md`. |
| DATA-09 | Soft deletes, so an accidental delete is a support ticket and not an incident | Met | Deleting a record offers Undo for 8 seconds. Removing a vehicle or erasing all data asks for confirmation first. |
| DATA-10 | Validation on the server, not just in the form | Met | Validation lives in `src/records.js`, not the form: real calendar dates, expiry on or after the registration date, odometer (km or mi) and cost as plain amounts within limits, known provinces and US states, only own record types, short string ids. Tests cover each rule. |
| DATA-11 | Timezones stored correctly, so the 9am reminder doesn't fire at 4am | Met | Dates are local calendar dates from the device's time zone (`localDate`), compared as date strings; checked in Chromium with clocks in Auckland and Los Angeles. |
| DATA-12 | Names with apostrophes work everywhere | Met | Apostrophes render, save, copy and back up correctly; all HTML output goes through `esc()`. |
| DATA-13 | Emoji, accents and right-to-left text work in every field | Met | Text is cut by code points; record fields and names use `dir="auto"` and `<bdi>`, so Arabic and Hebrew display in the right order next to numbers; full-width and zero-width characters in a VIN are cleaned up. |
| DATA-14 | Money stored as integers (0.1 + 0.2 ≠ 0.3 in floating point) | Met | Costs are stored as integer `costCents`, parsed from the digits; totals are exact (test: *costs are whole cents*). |
| DATA-15 | Currency, rounding and tax rules for every country you sell into | Met | Nothing is sold, so tax rules don't apply. Owner decided (2026-10-15): costs are Canadian dollars (decision 9). The form, CSV header and shared history say so; amounts are integer cents, and 89.99 and 89,99 parse the same. |
| DATA-16 | A data model that survives the second customer's "one small change" | Met | Owner decided (2026-10-15) to plan for US vehicles too. Each odometer reading keeps its own unit (km or mi), so a car that crosses the border keeps its history; rollback checks compare in km. The region list has US states (`US-XX`). Costs stay in Canadian dollars by decision. Saved data is version 3; older data upgrades on load (decision 10). |
| DATA-17 | Idempotency keys, so a retried payment doesn't charge twice | Met | No payments; every network call is a GET that's safe to retry. Restoring the same backup twice adds nothing, including records without ids, which get a content id (test: *imports: ids, duplicates and re-imports*). |
| DATA-18 | Deduplication for the user who clicks submit four times | Met | Repeat taps on Check while a VIN is loading are ignored and don't add history entries (verified: 4 taps, 1 lookup). The record form closes on the first submit. |
| DATA-19 | Pagination that still works on page 400 | Met | Your vehicles lists every vehicle with records plus the 6 latest lookups. The timeline isn't paged; fine to about 2,000 records (1.3 s). Revisit if logs grow past that. |
| DATA-20 | Exports, because every customer eventually wants a spreadsheet | Met | Export CSV per vehicle (quoted, BOM for Excel, formula-safe; in French with semicolons and decimal commas, as French Excel expects), backup files (JSON) and copy as text. The CLI has `--json`. |
| DATA-21 | Imports that survive the CSV someone saved in 2009 | Met | Restore normalizes VIN keys, handles BOMs, keeps both records when two share an id, says how many were skipped, explains a non-backup file, refuses future versions and files over 5 MB. Tests cover each. |
| DATA-22 | Retention rules, and code that deletes what the contract says you'll delete | Met | Stated in the README and footer: records, checked VINs and a MarketCheck key stay on the device until removed; listing histories, for the 20 most recently checked VINs. Remove a vehicle on its page; erase everything from the footer. Lookups without records are pruned beyond the latest 50. |
| DATA-23 | Storage rules, so you stop paying to keep old temp files | Met | The backup download URL is revoked after use; old lookups are pruned; listing histories are capped at 20 VINs; a full quota gets its own message. |

## Accounts and access (AUTH)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| AUTH-01 | Login works with a plus sign in the email address | N/A | No accounts or logins. Feedback hands off to github.com, which runs its own sign-in. |
| AUTH-02 | Password reset links that expire and work once | N/A | No passwords or accounts. |
| AUTH-03 | MFA, plus a recovery path for the user who lost their phone | Needs a person | No accounts in the app. The one login that can change production is the owner's GitHub account (sole admin; every push to `main` goes live). **Owner:** turn on GitHub 2FA with a passkey or authenticator app, store the recovery codes offline, and note the date here. |
| AUTH-04 | Sessions that time out, and a way to kill every session for one user | N/A | No sessions; the CLI keeps no state. Revoking GitHub sessions on a lost device is in `SECURITY.md`. |
| AUTH-05 | SSO for the enterprise customer who won't sign without it | N/A | No accounts to sign in to. |
| AUTH-06 | SAML, for IT teams that don't do magic links | N/A | No accounts or login flow. |
| AUTH-07 | SCIM, so an offboarded employee loses access immediately | N/A | No user accounts. Repo access at offboarding is covered by COMP-08. |
| AUTH-08 | Roles and permissions deeper than "admin" and "everyone else" | N/A | No accounts or roles; every visitor sees the same public data plus their own records. A second maintainer should get write or maintain, not admin. |
| AUTH-09 | Object-level checks, so user A can't read user B's data by changing an ID in the URL | N/A | No server-side records. `?vin=` loads public NHTSA data and only this browser's own records. |
| AUTH-10 | Tenant isolation, so one customer's bug never shows another customer's records | N/A | No tenants or server data. Note: every project site under pxkillah.github.io shares one origin and its storage; re-check before publishing another one there (or use a custom domain, COMP-10). |
| AUTH-11 | An admin "log in as this user" for support, with an audit trail on every use | N/A | No accounts to log in as; records never reach the owner. |
| AUTH-12 | Rate limits on login, so nobody can guess passwords at scale | N/A | No login to guess against. |
| AUTH-13 | Lockouts that stop attackers without locking out the CFO the night before the board meeting | N/A | No login to lock out. |

## Security (SEC)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| SEC-01 | Secrets kept out of the code, the repo and AI chat history | Met | No key, token or password in any file or in the history of any branch or PR (searched with `git log -p` on a mirror clone). The page itself holds no key: a visitor's own MarketCheck key is typed into a masked field, saved only in their browser, sent only to MarketCheck, and never written into the page (test: *the MarketCheck key is typed into a masked field and never part of the page*; a Chromium run checked the page's HTML after saving the key, loading a history and each error). The CLI's optional MarketCheck key is read from `MARKETCHECK_API_KEY` or `~/.marketcheck_key`, never from the repo, and is scrubbed from every error and the `--json` output (test: *the API key never appears in an error*). |
| SEC-02 | Every key that was ever pasted into a config file or chat has been rotated | Needs a person | Nothing in the repo to rotate. **Owner:** check whether any key (for example a MarketCheck API key) was ever pasted into a Claude session or environment setting, and rotate it if so. |
| SEC-03 | Every installed package confirmed to exist and to be the one you meant | Needs a person | No npm packages; the four fonts match the published @fontsource 5.3.0 files byte for byte. Unconfirmed: the `.mcp.json` MarketCheck docs endpoint, which this environment couldn't reach. **Owner:** confirm it connects in a Claude Code session, or delete `.mcp.json` if MarketCheck isn't being evaluated. |
| SEC-04 | Dependency scanning, because AI-added libraries go unreviewed | Met | No code dependencies to scan. Dependabot alerts and security updates are on (confirmed by the owner, 2026-10-15), and `.github/dependabot.yml` checks the workflow actions and npm monthly. |
| SEC-05 | Input sanitization everywhere a user can type | Met | Every input is validated in `src/`: VIN (`validateVin`), records (`makeRecord`, including imports), feedback (`feedbackUrl`). The MarketCheck key field takes 16 to 200 printable characters, and a saved listing history is re-checked (`isHistoryView`) before it's drawn (test: *a damaged saved view is not*). Only own record types count, so `constructor` is rejected. |
| SEC-06 | Protection against SQL injection, XSS, CSRF and the rest of the OWASP Top 10 | Met | All page HTML from API or user text goes through `esc()`; a Chromium run with hostile HTML in every field, and in MarketCheck's seller and city names, injected nothing. The CLI strips terminal control characters (test). No SQL or cookies, so no SQL injection or CSRF. |
| SEC-07 | File uploads scanned, size-limited and stored where they can't execute | Met | The only upload is Restore: read locally, parsed as JSON, re-validated record by record, never executed or served. Files over 5 MB are refused. |
| SEC-08 | CORS rules that aren't "allow everything" | N/A | No server or API of our own to set CORS on; the page is a client of NHTSA's CORS-enabled API. |
| SEC-09 | Security headers on every response | Met | `index.html` sets a Content-Security-Policy meta tag (scripts and styles only from the site, network only to the two NHTSA hosts and `api.marketcheck.com`) and `no-referrer`. Every flow ran in Chromium with zero violations; `test/page.test.js` guards it. Limit: GitHub Pages can't send real headers, so `frame-ancestors`, `nosniff` and Permissions-Policy aren't set; the clickjacking risk is low here. |
| SEC-10 | Encryption at rest and in transit | Met | Every request is HTTPS (constant https API bases, including MarketCheck's; GitHub enforces HTTPS on github.io). At rest, records and a visitor's MarketCheck key sit in the browser's own storage on the visitor's device, protected by the device's lock and disk encryption rather than by the page. |
| SEC-11 | Least-privilege access for everyone, including AI agents holding production credentials | Needs a person | The "Protect main" ruleset (verified 2026-10-15) means nothing reaches visitors without a pull request that passes `test (22)` and `test (24)`: no direct pushes, force pushes or deletion, and no bypass entries. Remaining risk: Claude sessions act with the owner's GitHub identity, so a session could merge its own PR once the tests pass, and GitHub can't require a second approver on a one-person repo. **Owner decides:** accept that, or add a second maintainer and require one approval. |
| SEC-12 | Logs that record who did what, without passwords, tokens or card numbers | N/A | No server, accounts or logs; deploys are attributed by git history. |
| SEC-13 | A penetration test before the enterprise customer's security team runs their own | N/A | No business customers and no server-side attack surface. The client side was tested for XSS (SEC-06) and the CSP (SEC-09). Re-check if the app gains a server or a business customer. |
| SEC-14 | Answers to the enterprise security questionnaire, with evidence behind each one | N/A | Free public tool; no buyer sends a questionnaire. Re-check if it's offered to an organisation. |
| SEC-15 | A vulnerability disclosure process for the day a stranger emails you one | Met | `SECURITY.md` explains how to report privately, and GitHub private vulnerability reporting is on (verified through GitHub's API, 2026-10-15). |
| SEC-16 | A plan for the day a laptop with production access is stolen | Met | "If a device with access is lost or stolen" checklist in `SECURITY.md`. Owner should read it once so it's familiar. Its "MarketCheck keys" section covers a key saved on a lost device. |

## Compliance (COMP)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| COMP-01 | SOC 2: policies, evidence and an auditor, not a checkbox | N/A | No company, business customers or customer data held anywhere. Re-check if the app is sold to businesses or gains a server. |
| COMP-02 | HIPAA, the moment a single patient record touches the system | N/A | No health information; NHTSA's injury counts are public totals. |
| COMP-03 | A BAA with every vendor that touches that data, including the AI model provider | N/A | No health information and no AI model provider. |
| COMP-04 | Audit trails that show who viewed a record, not just who changed it | N/A | No shared records; nobody but the device owner can view them. Re-check if records ever sync to a server. |
| COMP-05 | PCI scope understood, and card numbers kept out of your database | N/A | No payments or card fields. |
| COMP-06 | GDPR deletion requests that reach every table, backup and log | Met | Everything the app keeps is on the visitor's device and deletable there (Remove from this device; Remove key; Erase all in the footer, which also clears the MarketCheck key and saved listing histories). VINs a visitor sends to MarketCheck with their own key are under their own MarketCheck account. Feedback issues are public on GitHub; the owner deletes one on request (contact: see COMP-09). |
| COMP-07 | Data residency for the customer whose contract says EU only | N/A | No server-side storage or contracts. What leaves the device goes to NHTSA (US) and GitHub by design, and, only with the user's own key, the VIN to MarketCheck (US): from the CLI on each lookup, from the page when the visitor asks. |
| COMP-08 | Quarterly access reviews that someone signs off on | Needs a person | Production access is merging to `main` (now only through a pull request with passing tests): the owner (sole admin) and Claude sessions using the owner's GitHub connection. **Owner:** once a quarter, review collaborators, GitHub Apps and OAuth apps (including Claude), deploy keys and tokens, and the "Protect main" ruleset; note the date and outcome here. |
| COMP-09 | Terms and a privacy policy that match what the code actually does | Needs a person | The README has a Privacy section and the footer says what goes to NHTSA and what stays on the device; the CLI credits Transport Canada's Open Government Licence. The README's Privacy section and the page footer say the VIN goes to MarketCheck only when a user with their own key asks, and that the key stays on the device. `LICENSE` added: MIT, copyright pxkillah (owner's choice, 2026-10-15). **Owner decides:** a private contact for privacy requests (issues are public), for example an email address listed in the README. |
| COMP-10 | Every account, domain and repo in the company's name, not the prototype builder's | Needs a person | The repo, site and feedback destination belong to the personal account pxkillah (no custom domain). **Owner decides:** keep it personal and say so here, or move to an organisation and a custom domain before the link spreads. Moving strands saved records unless visitors back up and restore. |

## Infrastructure and delivery (OPS)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| OPS-01 | Dev, staging and production environments that match | Met | No build step: the files served locally (`python3 -m http.server`) are exactly what GitHub Pages serves. There's no staging; preview branches locally. |
| OPS-02 | Infrastructure as code, so the setup isn't in one person's memory | Met | The only infrastructure is GitHub Pages serving `main` from the repo root (README). CI, the live check and Dependabot are code in `.github/`. |
| OPS-03 | A deploy pipeline that runs the tests before anything reaches customers | Met | CI runs `npm test` on Node 22 and 24 for every PR, and the "Protect main" ruleset requires both checks to pass before merging (verified 2026-10-15), so only tested changes reach GitHub Pages. |
| OPS-04 | One-click rollbacks | Met | Revert the merged PR with GitHub's Revert button (or `git revert`); Pages redeploys in about a minute. `docs/runbook.md`. |
| OPS-05 | Zero-downtime deploys | Gap | Pages swaps files atomically, but browsers cache them for 10 minutes, so a reload just after a deploy can pair the new `app.js` with old cached `src/` modules and break if their exports changed. Runbook says to keep `src/` exports backward compatible for one release. Fix (medium): version the module URLs. |
| OPS-06 | Feature flags, so code can ship without the feature | N/A | No server-side configuration; unreleased work stays on branches. Re-check if a feature needs a staged rollout. |
| OPS-07 | Autoscaling for the Monday morning spike | N/A | No servers; static files on GitHub's CDN. |
| OPS-08 | A CDN, so the app loads fast far from the server | Met | GitHub Pages serves through its CDN. |
| OPS-09 | DNS, SSL certificates, and renewals that don't lapse on a Sunday | Met | `pxkillah.github.io` with HTTPS managed and renewed by GitHub. Re-check if a custom domain is added (COMP-10). |
| OPS-10 | Background job queues, so slow work doesn't freeze the page | N/A | No server; the browser makes a handful of requests behind a loading state. |
| OPS-11 | Retries with backoff, so one flaky API call doesn't become a lost order | Met | `src/http.js` retries network errors, 5xx and 429 with backoff (0.5 s, 1 s) and a 15 s timeout; `test/http.test.js`. |
| OPS-12 | A dead-letter queue for jobs that fail every retry | N/A | No background jobs. |
| OPS-13 | Cron jobs that don't run twice once there's a second server | N/A | No cron jobs on servers; the daily live check runs once on GitHub's scheduler. |
| OPS-14 | Caching, and clearing that cache when the data changes | Met | MarketCheck listing histories are kept per VIN on the device (the 20 most recent), because each call is billed to the visitor's key. The panel says when it was checked, Check again replaces it, and Remove from this device and Erase all clear it. NHTSA data isn't cached; every report is fetched fresh. Static-file caching is OPS-05. |
| OPS-15 | SPF, DKIM and DMARC, so transactional email doesn't land in spam | N/A | Sends no email. |
| OPS-16 | Bounce and complaint handling on every transactional email | N/A | Sends no email. |
| OPS-17 | Cost alerts, so a runaway loop shows up the same day and not on the invoice | Needs a person | Running the page costs nothing (GitHub Pages, free NHTSA APIs). The optional MarketCheck listing history, in the CLI or on the page, is billed to whoever's key it uses ($0.006 a call on a paid plan; free within 500 calls a month), at most 4 calls a lookup; the page calls only when the visitor taps and keeps the answer, so reopening a report costs nothing; MarketCheck's API Usage Alerts page sets email alerts. The spend is AI-assisted development. **Owner:** set a monthly limit and spend alerts in your Claude account. |
| OPS-18 | A disaster recovery plan, written down and tested once a year | Needs a person | Written in `docs/runbook.md` (serve the static files from any host; visitors move records by backup). **Owner:** test it once a year by deploying a clone to a second host. |
| OPS-19 | A second region, if the contract promises uptime one region can't deliver | N/A | No uptime commitment. |

## Observability and incidents (OBS)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| OBS-01 | Structured logs you can search at 3am | N/A | No server, so nothing to log. The CLI prints its report to the terminal. |
| OBS-02 | Error tracking that groups the same bug instead of sending 4,000 emails | N/A | An error-tracking service would break the page's promise to contact only NHTSA and, with a visitor's own key, MarketCheck (decisions 3 and 13). Errors are explained on the page, visitors report them with Send feedback, and the live check catches API breakage. |
| OBS-03 | Uptime checks from outside your own network | Met | `.github/workflows/live-check.yml` calls the real NHTSA APIs daily, from GitHub's network. The site itself relies on GitHub Pages' availability. |
| OBS-04 | Alerts that page a human, tuned until they stop paging for nothing | Needs a person | GitHub emails the owner when the live check or CI fails. **Owner:** confirm Actions failure emails are on (GitHub Settings → Notifications → Actions). |
| OBS-05 | Dashboards for latency, error rate and throughput | N/A | No server and no analytics, by design. |
| OBS-06 | Tracing for one slow request across every service it touches | N/A | One page calling one external API; no services to trace. |
| OBS-07 | An on-call rotation, and a person who picks up | Needs a person | One maintainer and no uptime promise. **Owner decides** who, if anyone, is on call; at minimum, act on live-check failure emails. |
| OBS-08 | Runbooks, so the on-call engineer knows what an alert means | Met | `docs/runbook.md`: live-check failures by kind, rolling back a deploy, lost records, losing GitHub Pages. |
| OBS-09 | Postmortems that change something | Needs a person | Template in `docs/runbook.md`. No incidents yet; writing them up is the owner's practice. |
| OBS-10 | A status page customers check before they email you | N/A | Free tool with no uptime promise; the page itself says when NHTSA isn't responding. |

## Testing (TEST)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| TEST-01 | Unit tests written by someone who knows what the logic should do | Met | 69 offline tests cover every module in `src/`, including retries, error kinds, parsers, records rules, storage upgrades, units, and English/French message parity. They were written by the AI that wrote the code; PEOPLE-08 covers human review. |
| TEST-02 | Integration tests for every third-party API you depend on | Met | `scripts/live-check.js` checks every NHTSA endpoint against the sample VIN, daily and on every pull request that changes the code that talks to NHTSA (`.github/workflows/live-check.yml`). Offline tests cover the documented formats. MarketCheck is optional and paid, so it has no live check (one would need a key as an Actions secret and costs a call a run); its documented format is covered offline, and a change shows as an error, never as no listings. First real run passed on PR #8 (2026-10-15): 24 recalls, 2,013 complaints, 4 rated versions. |
| TEST-03 | End-to-end tests for the flows that matter most (signup, checkout, the core task) | Gap | No automated end-to-end test in the repo. The flows (lookup, add record, undo, backup, restore, CSV, feedback, remove, erase) were checked with Playwright scripts during development but not kept. Fix (medium): add Playwright tests to CI, which adds a dev dependency. |
| TEST-04 | Load testing before the launch email goes out | N/A | Static files on a CDN; NHTSA's capacity isn't ours to test. |
| TEST-05 | Test data that looks like production without being production data | Met | Tests use NHTSA's published sample VIN and minimal payloads in the documented formats. No real user data exists outside visitors' browsers. |
| TEST-06 | Regression tests, so fixing bug 41 doesn't bring back bug 12 | Met | Each bug fixed in this pass has a test that fails on the old code (checked by running the new tests against it). |
| TEST-07 | Testing on the five-year-old laptop and the old phone real users still have | Needs a person | Fixed: every lookup failed on Safari before 16 (iOS 15). **Still needed:** try the page on a real older iPhone (iOS 15 or 16) and an older Android phone. |
| TEST-08 | Accessibility compliance (WCAG 2.1 AA) | Needs a person | axe-core finds no WCAG 2.1 A or AA violations on the home page, a report and both forms, in English and French, light and dark, at 390 and 320 px wide (2026-10-15). Nothing spills sideways at 320 px. Automated checks catch only part. Known limit: with the phone's text size at 150%, the complaint figures and records panel still get wider than the screen. **Needed:** one pass with VoiceOver or TalkBack by a person. |

## Billing (BILL)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| BILL-01 | Subscriptions, upgrades, downgrades and proration | N/A | Nothing is sold. |
| BILL-02 | Failed-payment retries and dunning emails | N/A | No payments. |
| BILL-03 | Invoices with the customer's PO number on them | N/A | No invoices or business customers. |
| BILL-04 | Sales tax and VAT | N/A | Nothing is sold. |
| BILL-05 | Refunds, credits and partial refunds | N/A | No charges to refund. |
| BILL-06 | Usage metering that matches what you bill, to the cent | N/A | No billed usage and no paid upstream. Re-check if a paid tier or data source is added. |
| BILL-07 | Annual contracts with custom terms | N/A | No contracts. |
| BILL-08 | Revenue reports finance can reconcile | N/A | No revenue. |

## APIs and integrations (API)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| API-01 | Incoming webhooks verify signatures | N/A | Receives no webhooks. |
| API-02 | Outgoing webhooks retry, with a log of every failed delivery | N/A | Sends no webhooks. |
| API-03 | A versioned API, so it can change without breaking customers' integrations | N/A | No public API. The CLI's `--json` output is the closest thing; it's unversioned. Re-check if anyone builds on it. |
| API-04 | API keys customers can create and revoke | N/A | No API keys to issue. |
| API-05 | API rate limits that protect you without blocking real integrations | N/A | No API of our own to rate-limit. |
| API-06 | A plan for the day a third-party API changes its response format without notice | Met | Parsers throw a `FormatError` instead of returning empty lists, so a changed NHTSA format shows as "couldn't load", never "no recalls" (tests). MarketCheck's parser does the same (test: *a changed MarketCheck format is an error*), and the page says MarketCheck sent a format it doesn't recognize. The daily live check reports it; the runbook says what to do. |
| API-07 | OAuth token refresh, because tokens expire at the worst moment | N/A | No OAuth tokens. |
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
| UX-09 | Translations, with dates and numbers formatted for each locale | Needs a person | English and French (Canada): every page string, dates (15 oct. 2026, 1er), numbers and money (89,99 $), km or mi, province and state names, CSV and shared history. Language follows the device, with a switch that's remembered; `?lang=fr` works. NHTSA's own text stays in English and is marked `lang="en"`. Tests check both languages have every key and placeholder. **Needed:** a fluent Quebec French speaker to review the wording; it was translated by the AI that wrote the code. |
| UX-10 | A back button that does what people expect | Met | Back closes an open form instead of leaving the page behind it; lookups don't add duplicate history entries; `?vin=` links work. |

## Code, docs and team (CODE)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| CODE-01 | Code a human can read | Met | Small, commented modules in `src/`; the page is split into markup, styles and script. |
| CODE-02 | Code review on every change | Needs a person | The ruleset makes every change go through a pull request, but nobody besides the owner reviews them. See PEOPLE-01. |
| CODE-03 | A branching strategy, so two people don't overwrite each other | Met | Work happens on branches and reaches `main` through pull requests, enforced by the "Protect main" ruleset and stated in `CLAUDE.md`. |
| CODE-04 | Monthly dependency upgrades, never two major versions behind | Met | No npm dependencies; Dependabot checks workflow actions and npm monthly. |
| CODE-05 | Framework and runtime upgrades before the old version loses security patches | Met | Node 22 or later (18 and 20 no longer get security fixes); CI tests 22 and 24. |
| CODE-06 | Dead code from earlier attempts deleted | Met | No unused functions in `src/` or `app.js` (checked 2026-10-15). A few constants are exported but only used inside their module. |
| CODE-07 | No 2,000-line files that everything gets appended to | Met | `index.html` (1,426 lines) is split into `index.html`, `app.css` and `app.js`; the largest file is `app.js` at about 900 lines. Split `app.js` by feature if it keeps growing. |
| CODE-08 | Architecture decisions written down, with the reasons | Met | `docs/decisions.md`. |
| CODE-09 | A README that gets a new engineer running locally in under an hour | Met | README "Run it locally": clone, `npm test`, serve; no install step. |
| CODE-10 | Documentation for whoever inherits this | Met | README, `CLAUDE.md`, `docs/decisions.md`, `docs/runbook.md`, `SECURITY.md` and `CHANGELOG.md`. |
| CODE-11 | An admin panel for the ops team | N/A | No server-side data or users to administer. |
| CODE-12 | Support tooling, so support can answer questions without pinging engineering | N/A | No server-side user data; support happens in GitHub issues, and records stay on the visitor's device. |
| CODE-13 | A changelog customers can read | Met | `CHANGELOG.md`. |
| CODE-14 | A bus factor higher than one | Needs a person | One owner. The docs reduce what lives in one head; a second maintainer with write access would raise the bus factor. |

## People (PEOPLE)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| PEOPLE-01 | Reading every line the AI wrote before it ships | Needs a person | Today no one but the AI reads the code before it ships. Needed: a senior engineer reviewing PRs. |
| PEOPLE-02 | Designing the data model before the second customer breaks it | Needs a person | No database. The records model's open decisions (DATA-15, DATA-16) are made and built (decisions 9 and 10); a backend engineer's review of it is still worth having. |
| PEOPLE-03 | Explaining why the AI's fix for one bug created two new ones | Needs a person | Same reviewer as PEOPLE-01. |
| PEOPLE-04 | Deploys, rollbacks, servers and the cloud bill | N/A | No servers or cloud bill; deploys are merges to `main`. |
| PEOPLE-05 | Answering the page at 3am when payments stop | N/A | No payments and no uptime promise. |
| PEOPLE-06 | Patching the framework the week a vulnerability goes public | Needs a person | No framework or dependencies, but browsers, Node and the workflow actions still get advisories. Owner acts on Dependabot PRs and alerts. |
| PEOPLE-07 | Walking an auditor through how sensitive data moves | N/A | No regulated or sensitive data held anywhere but the visitor's own device. |
| PEOPLE-08 | Testing what the AI says it tested | Needs a person | All testing so far, including the browser checks, was done by the AI that wrote the code. Needed: a person testing on real devices (TEST-07, TEST-08). |
| PEOPLE-09 | Running a migration on a live database without losing a row | N/A | No live database; saved data upgrades in the browser (DATA-02). |
| PEOPLE-10 | Saying no to the feature that breaks three others | Needs a person | The owner, as the only maintainer. |
| PEOPLE-11 | Turning "works on my laptop" into "works for every customer at once" | N/A | Static files on a CDN serve every visitor the same way; there's no shared state to scale. |
| PEOPLE-12 | Debugging the code when the AI that wrote it can't | Needs a person | Needed when an AI-written bug resists AI debugging. |
| PEOPLE-13 | Remembering why it's built this way, a year from now | Needs a person | `docs/decisions.md` and `CHANGELOG.md` record the why; the owner is the person who was there. |
