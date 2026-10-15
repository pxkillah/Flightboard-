# Production standard

The bar every app has to clear before real people depend on it. It's written for a multi-customer
product with accounts, payments and a database, so not every item applies to every app. Each item
still gets an explicit answer, because "we didn't think about it" and "it doesn't apply" look the
same until something breaks.

## How to apply it

1. **Keep a status file per app.** Each app has a `docs/production-readiness.md` with one row per
   item ID below. Each row gets one of four statuses:
   - **Met**: give the evidence (file, test, setting or link).
   - **Gap**: what is missing. Fix it, or record why it waits.
   - **N/A**: why it doesn't apply, naming the missing capability, for example "no user accounts".
   - **Needs a person**: what decision or human work is outstanding, and who owns it.
2. **N/A is a reason, not an answer forever.** When a change adds a capability (accounts, a
   server, a database, payments, uploads, email, an AI model, a second customer), re-check every
   item whose N/A reason named it before the change ships.
3. **Don't bolt on machinery an app doesn't need.** SSO for an app with no accounts, or a job
   queue for an app with no server, is cost without benefit. The answer is N/A with its reason.
4. **Every change checks the items it touches.** A change to a form checks validation, input
   handling, error states and accessibility. A change that adds a dependency checks the
   dependency items. Update the status file in the same change.
5. **People are part of the standard.** The last section lists work that needs a qualified
   person. An AI agent can do a lot of the legwork but can't be the sign-off. Where an item
   needs one, mark it **Needs a person** rather than claiming it's done.

## Data and storage (DATA)

| ID | Requirement |
|---|---|
| DATA-01 | A schema someone designed, not one improvised table by table |
| DATA-02 | Database migrations that run forward and roll back |
| DATA-03 | Migrations that don't lock the main table during business hours |
| DATA-04 | Indexes for the queries real data volumes need (5 million rows, not 50) |
| DATA-05 | Connection pooling, so a traffic spike doesn't exhaust the database |
| DATA-06 | Nightly backups |
| DATA-07 | Restores from those backups, tested |
| DATA-08 | Point-in-time recovery, for the delete without a WHERE clause |
| DATA-09 | Soft deletes, so an accidental delete is a support ticket and not an incident |
| DATA-10 | Validation on the server, not just in the form |
| DATA-11 | Timezones stored correctly, so the 9am reminder doesn't fire at 4am |
| DATA-12 | Names with apostrophes work everywhere |
| DATA-13 | Emoji, accents and right-to-left text work in every field |
| DATA-14 | Money stored as integers (0.1 + 0.2 ≠ 0.3 in floating point) |
| DATA-15 | Currency, rounding and tax rules for every country you sell into |
| DATA-16 | A data model that survives the second customer's "one small change" |
| DATA-17 | Idempotency keys, so a retried payment doesn't charge twice |
| DATA-18 | Deduplication for the user who clicks submit four times |
| DATA-19 | Pagination that still works on page 400 |
| DATA-20 | Exports, because every customer eventually wants a spreadsheet |
| DATA-21 | Imports that survive the CSV someone saved in 2009 |
| DATA-22 | Retention rules, and code that deletes what the contract says you'll delete |
| DATA-23 | Storage rules, so you stop paying to keep old temp files |

## Accounts and access (AUTH)

| ID | Requirement |
|---|---|
| AUTH-01 | Login works with a plus sign in the email address |
| AUTH-02 | Password reset links that expire and work once |
| AUTH-03 | MFA, plus a recovery path for the user who lost their phone |
| AUTH-04 | Sessions that time out, and a way to kill every session for one user |
| AUTH-05 | SSO for the enterprise customer who won't sign without it |
| AUTH-06 | SAML, for IT teams that don't do magic links |
| AUTH-07 | SCIM, so an offboarded employee loses access immediately |
| AUTH-08 | Roles and permissions deeper than "admin" and "everyone else" |
| AUTH-09 | Object-level checks, so user A can't read user B's data by changing an ID in the URL |
| AUTH-10 | Tenant isolation, so one customer's bug never shows another customer's records |
| AUTH-11 | An admin "log in as this user" for support, with an audit trail on every use |
| AUTH-12 | Rate limits on login, so nobody can guess passwords at scale |
| AUTH-13 | Lockouts that stop attackers without locking out the CFO the night before the board meeting |

## Security (SEC)

| ID | Requirement |
|---|---|
| SEC-01 | Secrets kept out of the code, the repo and AI chat history |
| SEC-02 | Every key that was ever pasted into a config file or chat has been rotated |
| SEC-03 | Every installed package confirmed to exist and to be the one you meant |
| SEC-04 | Dependency scanning, because AI-added libraries go unreviewed |
| SEC-05 | Input sanitization everywhere a user can type |
| SEC-06 | Protection against SQL injection, XSS, CSRF and the rest of the OWASP Top 10 |
| SEC-07 | File uploads scanned, size-limited and stored where they can't execute |
| SEC-08 | CORS rules that aren't "allow everything" |
| SEC-09 | Security headers on every response |
| SEC-10 | Encryption at rest and in transit |
| SEC-11 | Least-privilege access for everyone, including AI agents holding production credentials |
| SEC-12 | Logs that record who did what, without passwords, tokens or card numbers |
| SEC-13 | A penetration test before the enterprise customer's security team runs their own |
| SEC-14 | Answers to the enterprise security questionnaire, with evidence behind each one |
| SEC-15 | A vulnerability disclosure process for the day a stranger emails you one |
| SEC-16 | A plan for the day a laptop with production access is stolen |

## Compliance (COMP)

| ID | Requirement |
|---|---|
| COMP-01 | SOC 2: policies, evidence and an auditor, not a checkbox |
| COMP-02 | HIPAA, the moment a single patient record touches the system |
| COMP-03 | A BAA with every vendor that touches that data, including the AI model provider |
| COMP-04 | Audit trails that show who viewed a record, not just who changed it |
| COMP-05 | PCI scope understood, and card numbers kept out of your database |
| COMP-06 | GDPR deletion requests that reach every table, backup and log |
| COMP-07 | Data residency for the customer whose contract says EU only |
| COMP-08 | Quarterly access reviews that someone signs off on |
| COMP-09 | Terms and a privacy policy that match what the code actually does |
| COMP-10 | Every account, domain and repo in the company's name, not the prototype builder's |

## Infrastructure and delivery (OPS)

| ID | Requirement |
|---|---|
| OPS-01 | Dev, staging and production environments that match |
| OPS-02 | Infrastructure as code, so the setup isn't in one person's memory |
| OPS-03 | A deploy pipeline that runs the tests before anything reaches customers |
| OPS-04 | One-click rollbacks |
| OPS-05 | Zero-downtime deploys |
| OPS-06 | Feature flags, so code can ship without the feature |
| OPS-07 | Autoscaling for the Monday morning spike |
| OPS-08 | A CDN, so the app loads fast far from the server |
| OPS-09 | DNS, SSL certificates, and renewals that don't lapse on a Sunday |
| OPS-10 | Background job queues, so slow work doesn't freeze the page |
| OPS-11 | Retries with backoff, so one flaky API call doesn't become a lost order |
| OPS-12 | A dead-letter queue for jobs that fail every retry |
| OPS-13 | Cron jobs that don't run twice once there's a second server |
| OPS-14 | Caching, and clearing that cache when the data changes |
| OPS-15 | SPF, DKIM and DMARC, so transactional email doesn't land in spam |
| OPS-16 | Bounce and complaint handling on every transactional email |
| OPS-17 | Cost alerts, so a runaway loop shows up the same day and not on the invoice |
| OPS-18 | A disaster recovery plan, written down and tested once a year |
| OPS-19 | A second region, if the contract promises uptime one region can't deliver |

## Observability and incidents (OBS)

| ID | Requirement |
|---|---|
| OBS-01 | Structured logs you can search at 3am |
| OBS-02 | Error tracking that groups the same bug instead of sending 4,000 emails |
| OBS-03 | Uptime checks from outside your own network |
| OBS-04 | Alerts that page a human, tuned until they stop paging for nothing |
| OBS-05 | Dashboards for latency, error rate and throughput |
| OBS-06 | Tracing for one slow request across every service it touches |
| OBS-07 | An on-call rotation, and a person who picks up |
| OBS-08 | Runbooks, so the on-call engineer knows what an alert means |
| OBS-09 | Postmortems that change something |
| OBS-10 | A status page customers check before they email you |

## Testing (TEST)

| ID | Requirement |
|---|---|
| TEST-01 | Unit tests written by someone who knows what the logic should do |
| TEST-02 | Integration tests for every third-party API you depend on |
| TEST-03 | End-to-end tests for the flows that matter most (signup, checkout, the core task) |
| TEST-04 | Load testing before the launch email goes out |
| TEST-05 | Test data that looks like production without being production data |
| TEST-06 | Regression tests, so fixing bug 41 doesn't bring back bug 12 |
| TEST-07 | Testing on the five-year-old laptop and the old phone real users still have |
| TEST-08 | Accessibility compliance (WCAG 2.1 AA) |

## Billing (BILL)

| ID | Requirement |
|---|---|
| BILL-01 | Subscriptions, upgrades, downgrades and proration |
| BILL-02 | Failed-payment retries and dunning emails |
| BILL-03 | Invoices with the customer's PO number on them |
| BILL-04 | Sales tax and VAT |
| BILL-05 | Refunds, credits and partial refunds |
| BILL-06 | Usage metering that matches what you bill, to the cent |
| BILL-07 | Annual contracts with custom terms |
| BILL-08 | Revenue reports finance can reconcile |

## APIs and integrations (API)

| ID | Requirement |
|---|---|
| API-01 | Incoming webhooks verify signatures |
| API-02 | Outgoing webhooks retry, with a log of every failed delivery |
| API-03 | A versioned API, so it can change without breaking customers' integrations |
| API-04 | API keys customers can create and revoke |
| API-05 | API rate limits that protect you without blocking real integrations |
| API-06 | A plan for the day a third-party API changes its response format without notice |
| API-07 | OAuth token refresh, because tokens expire at the worst moment |
| API-08 | A sandbox where customers can test their integration |

## AI features (AI)

| ID | Requirement |
|---|---|
| AI-01 | Protection against prompt injection in every field that reaches the model |
| AI-02 | Customer and patient data kept out of prompts that leave your network |
| AI-03 | A model spend cap per customer |
| AI-04 | Evals, so you notice when a model update makes answers worse |
| AI-05 | A fallback for when the model provider is down |
| AI-06 | A migration plan for when the model is deprecated |
| AI-07 | Prompt and output logs for debugging, minus what you're not allowed to keep |
| AI-08 | A human approval step for anything the AI does that can't be undone |

## User experience (UX)

| ID | Requirement |
|---|---|
| UX-01 | Pages that load on hotel wifi |
| UX-02 | Empty, loading and error states on every screen |
| UX-03 | Error messages a person can act on, not "something went wrong" |
| UX-04 | Forms that keep what people typed when one field fails validation |
| UX-05 | Emails that render in every mail client your users have |
| UX-06 | Notifications people can turn off |
| UX-07 | Undo |
| UX-08 | Keyboard navigation and screen reader support |
| UX-09 | Translations, with dates and numbers formatted for each locale |
| UX-10 | A back button that does what people expect |

## Code, docs and team (CODE)

| ID | Requirement |
|---|---|
| CODE-01 | Code a human can read |
| CODE-02 | Code review on every change |
| CODE-03 | A branching strategy, so two people don't overwrite each other |
| CODE-04 | Monthly dependency upgrades, never two major versions behind |
| CODE-05 | Framework and runtime upgrades before the old version loses security patches |
| CODE-06 | Dead code from earlier attempts deleted |
| CODE-07 | No 2,000-line files that everything gets appended to |
| CODE-08 | Architecture decisions written down, with the reasons |
| CODE-09 | A README that gets a new engineer running locally in under an hour |
| CODE-10 | Documentation for whoever inherits this |
| CODE-11 | An admin panel for the ops team |
| CODE-12 | Support tooling, so support can answer questions without pinging engineering |
| CODE-13 | A changelog customers can read |
| CODE-14 | A bus factor higher than one |

## People (PEOPLE)

Keeping all of this working every day needs people who know what they're doing. An AI agent can
draft, test and flag, but these need a qualified person to own them:

| ID | Work | Who |
|---|---|---|
| PEOPLE-01 | Reading every line the AI wrote before it ships | Senior engineer |
| PEOPLE-02 | Designing the data model before the second customer breaks it | Backend engineer |
| PEOPLE-03 | Explaining why the AI's fix for one bug created two new ones | Senior engineer |
| PEOPLE-04 | Deploys, rollbacks, servers and the cloud bill | DevOps engineer |
| PEOPLE-05 | Answering the page at 3am when payments stop | Whoever is on call |
| PEOPLE-06 | Patching the framework the week a vulnerability goes public | Security |
| PEOPLE-07 | Walking an auditor through how sensitive data moves | Security and compliance |
| PEOPLE-08 | Testing what the AI says it tested | QA |
| PEOPLE-09 | Running a migration on a live database without losing a row | Backend engineer |
| PEOPLE-10 | Saying no to the feature that breaks three others | Tech lead |
| PEOPLE-11 | Turning "works on my laptop" into "works for every customer at once" | Architect |
| PEOPLE-12 | Debugging the code when the AI that wrote it can't | Senior engineer |
| PEOPLE-13 | Remembering why it's built this way, a year from now | Someone who was there |
