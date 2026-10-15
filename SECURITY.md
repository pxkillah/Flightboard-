# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue or through the page's
Send feedback button (feedback becomes a public GitHub issue).

Use GitHub's private reporting: open the repository's **Security** tab and choose
**Report a vulnerability**, or go to
<https://github.com/pxkillah/Flightboard-/security/advisories/new>.

Expect a first reply within 7 days. Only the live site (the `main` branch, served by GitHub
Pages) and the current CLI are supported.

## What's in scope

- The web page: it runs entirely in the browser, keeps records in `localStorage` and should
  contact nothing but NHTSA (enforced by a Content-Security-Policy in `index.html`).
- The CLI (`bin/vehicle-report.js`), which prints data from NHTSA and Transport Canada.
- This repository and its GitHub Actions workflows.

## If a device with access is lost or stolen

Anyone holding a signed-in device can push to `main`, and GitHub Pages publishes `main` to
every visitor within about a minute. A pushed script could read visitors' saved records.
From another device, as soon as possible:

1. On GitHub: sign out of all sessions, change the password, and confirm two-factor
   authentication is still on with your own method.
2. Remove SSH keys, personal access tokens and authorized apps you don't recognize or no
   longer need, including Claude (Settings → Applications) if the lost device used it.
3. Sign out of claude.ai on all devices, and end any running Claude Code sessions.
4. Compare `main` and the Pages deployment list (Actions or Deployments) with what you
   expect. Revert anything unexpected (see `docs/runbook.md`).
5. Check collaborators, rulesets, Pages settings and Actions secrets for changes.

The "Protect main" ruleset requires a pull request with passing tests and blocks force
pushes, so anything a stolen login publishes leaves a pull request behind and can be
reverted. See `docs/production-readiness.md` (SEC-11).
