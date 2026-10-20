# Security

## Reporting a vulnerability

Please report security problems privately by email to **creport88@gmail.com**, with "Security" in
the subject. While the repository is public, GitHub's private reporting also works: the
**Security** tab → **Report a vulnerability**.

Expect a first reply within 7 days. Only the current app versions in the App Store and
Google Play, the `main` branch and the current CLI are supported.

## What's in scope

- The page, as the iOS and Android app and as the website: it keeps records on the device
  (`localStorage`, plus a copy in the phone's settings store in the app) and should contact
  nothing but NHTSA, plus MarketCheck when a website visitor with their own key asks for a
  listing history (enforced by a Content-Security-Policy in `index.html`).
- The native projects in `mobile/` and the Capacitor plugins they use.
- The CLI (`bin/vehicle-report.js`), which prints data from NHTSA and Transport Canada, and
  from MarketCheck when a key is set.
- This repository and its GitHub Actions workflows.

## If a device with access is lost or stolen

Anyone holding a signed-in device can push to `main`, and GitHub Pages publishes `main` to
every visitor within about a minute. Anyone holding the Mac with Xcode and the Android upload
key, and signed in to App Store Connect or Play Console, can ship an app update. A pushed
script could read people's saved records and MarketCheck keys. From another device, as soon as possible:

1. On GitHub: sign out of all sessions, change the password, and confirm two-factor
   authentication is still on with your own method.
2. Remove SSH keys, personal access tokens and authorized apps you don't recognize or no
   longer need, including Claude (Settings → Applications) if the lost device used it.
3. Sign out of claude.ai on all devices, and end any running Claude Code sessions.
4. Compare `main` and the Pages deployment list (Actions or Deployments) with what you
   expect. Revert anything unexpected (see `docs/runbook.md`).
5. Check collaborators, rulesets, Pages settings and Actions secrets for changes.
6. Apple: change the Apple ID password, remove the lost device from it, and in App Store
   Connect check Users and Access and that no unexpected build is in review. Revoke the
   distribution certificate at developer.apple.com if the Mac was lost.
7. Google: change the password, sign out the lost device, and in Play Console check Users and
   permissions and that no unexpected release is rolling out (halt it if so). If the Mac held
   the Android upload key, ask Google to reset the upload key (Play App Signing keeps the
   real signing key safe).

The "Protect main" ruleset requires a pull request with passing tests and blocks force
pushes, so anything a stolen login publishes leaves a pull request behind and can be
reverted. GitHub enforces rulesets on private repositories only on paid plans (Pro or
above), so once this repository is private on the free plan the ruleset stops applying. See
`docs/production-readiness.md` (SEC-11).

## MarketCheck keys

A MarketCheck key saved on the page sits in that browser's storage. Anyone who uses that
browser, and any page published under pxkillah.github.io (all GitHub Pages sites there share
the storage), could read it, so publish only trusted pages there. If a device with a saved key
is lost, or the key was ever pasted into a chat, an issue or a shared file, delete the key on
your MarketCheck dashboard (<https://developers.marketcheck.com>) and create a new one. Removing
the key from the page, or Erase all, only removes it from that browser; it doesn't cancel it.
