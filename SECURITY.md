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

- The web page: it runs entirely in the browser, keeps records (and a visitor's MarketCheck
  key, if they add one) in `localStorage`, and should contact nothing but NHTSA, plus
  MarketCheck when a visitor with a key asks for a listing history (enforced by a
  Content-Security-Policy in `index.html`).
- The CLI (`bin/vehicle-report.js`), which prints data from NHTSA and Transport Canada, and
  from MarketCheck when a key is set.
- This repository and its GitHub Actions workflows.

## If a device with access is lost or stolen

Anyone holding a signed-in device can push to `main`, and GitHub Pages publishes `main` to
every visitor within about a minute. A pushed script could read visitors' saved records and
MarketCheck keys.
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

## MarketCheck keys

A MarketCheck key saved on the page sits in that browser's storage. Anyone who uses that
browser, and any page published under pxkillah.github.io (all GitHub Pages sites there share
the storage), could read it, so publish only trusted pages there. If a device with a saved key
is lost, or the key was ever pasted into a chat, an issue or a shared file, delete the key on
your MarketCheck dashboard (<https://developers.marketcheck.com>) and create a new one. Removing
the key from the page, or Erase all, only removes it from that browser; it doesn't cancel it.
