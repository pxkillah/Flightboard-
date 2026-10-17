# Runbook

What to do when something goes wrong with Car Report. The same page runs as the iOS and
Android app (bundled in `mobile/`, released from the owner's Mac: `docs/app-release.md`) and,
while the repository is public, as a static site on GitHub Pages. Either way it calls NHTSA
directly from the phone or browser, so most incidents are NHTSA's or a bad release.

## The daily live check failed

`.github/workflows/live-check.yml` runs `scripts/live-check.js`, which builds a real report
for NHTSA's sample VIN, every day and on pull requests that change the code that talks to
NHTSA. GitHub emails the repo owner when a scheduled run fails. Open the failed run;
each `::error::` line names the section and the kind of failure:

| Kind | Meaning | What to do |
|---|---|---|
| `unreachable`, `timeout` | Couldn't reach NHTSA or it was too slow | Re-run the workflow later. If it fails for more than a day, check NHTSA's status. The page already tells visitors NHTSA isn't responding. |
| `unavailable` | NHTSA answered with a 5xx or 429 | Same as above. Nothing to fix in the code. |
| `refused` | NHTSA answered with a 4xx | The endpoint or its parameters may have changed. Compare the URL in the error with NHTSA's API docs. |
| `format` | The response no longer has the fields the parsers read | NHTSA changed its format. The page shows "couldn't load" for that section instead of wrong data. Update the parser in `src/sources/` and its tests. |

A warning about Transport Canada only affects the CLI. The page links to Transport Canada
instead of fetching it.

GitHub disables scheduled workflows in a repository with no activity for 60 days. If the
emails stop, check that the workflow is still enabled (Actions → Live NHTSA check).

## A store release broke the app

Store releases can't be undone instantly, and people keep the version they installed.

1. Stop the spread: in Play Console, **halt the staged rollout** (Release → Production);
   in App Store Connect, **pause the phased release**. Release new versions at 10% first
   for this reason.
2. Fix forward: revert the bad change on GitHub (below), then `npm run sync`, raise the
   version and build number, and upload a new build (`docs/app-release.md`).
3. For a serious bug on iPhone, ask Apple for an **expedited review** when submitting.
4. Keep the previous build installed through TestFlight or Play's internal testing, so you
   can compare against it.

## A deploy broke the website

GitHub Pages publishes every commit on `main`. To roll back, revert the bad commit:

- On GitHub, open the merged pull request and click **Revert**, then merge the revert, or
- Locally: `git revert <commit>` and push to `main`.

Pages redeploys in about a minute. Visitors may keep cached files for up to 10 minutes. A
reload during that window can mix the new page with old cached files from `src/`, so keep
changes to `src/` exports backward compatible for one release where you can.

## Someone lost their records

Records live only on that phone or browser. The app also keeps a copy in the phone's own
settings store and restores it if the web view's storage is wiped (`native.js`); deleting the
app deletes both. On the website, Safari can clear storage for sites that haven't been
opened in a while. The only recovery is a backup file they saved (Restore on any vehicle
page), which is why the page reminds them when there's no recent backup.

If the page said saved records "couldn't be read", the original data was copied to the
`vin-report:v1:unreadable` key in that browser's `localStorage`. On a desktop browser:
open the developer tools console on the site and run
`copy(localStorage.getItem('vin-report:v1:unreadable'))`, paste it into a file, fix it and
restore it.

## GitHub Pages or the account is unavailable

The app doesn't depend on GitHub at all once installed. For the website:

The site is plain static files with no build step. Any static host can serve a checkout of
`main` (for example Cloudflare Pages or Netlify). Records are stored per site address, so
visitors need to save a backup on the old address and restore it on the new one.
The code itself is safe as long as the repository or a clone exists. Keep a clone on a
second device.

## After an incident

Write a short postmortem in the issue or pull request that fixed it:

- What happened, when, and who was affected.
- How it was noticed, and how long that took.
- The root cause, not just the trigger.
- What changes so it can't happen the same way again (a test, a check, a doc), with links.
