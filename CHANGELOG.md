# Changelog

Changes people using VIN Report would notice. Newest first.

## Unreleased

- **En français.** The whole page is available in French (Canada), following your device's
  language, with a switch on the home page and in the footer.
- **Miles or kilometres.** Each odometer reading can be in km or mi; the rollback warning
  compares them correctly.
- **US states** can be chosen for a registration, alongside Canadian provinces.
- Costs are labelled as Canadian dollars.
- The VIN strip, tiles and panel headings fit on 320 px wide phones.
- The code is now licensed under MIT (`LICENSE`).
- **Never shows a failed or changed answer as "no recalls."** If NHTSA is down or changes how
  it sends data, the report says it couldn't load that part, instead of showing none.
- **Clearer errors.** When NHTSA isn't responding, the page says so and no longer suggests the
  VIN was mistyped.
- **Works on older iPhones.** Lookups no longer fail on iOS 15.
- **My records:**
  - Undo after deleting a record.
  - Export a vehicle's records as a spreadsheet (CSV).
  - The page says when you have no backup, or your records changed since the last one.
  - Remove a vehicle from this device, or erase all VIN Report data from the footer.
  - Costs are exact to the cent and can be typed as 89,99 or 1 234,56.
  - Dates must exist, and a registration can't expire before it starts.
  - Restoring a backup says how many records were skipped, and restoring the same file
    twice no longer adds copies.
  - "Your vehicles" lists every vehicle you've added records to.
- **Feedback button** in the footer (opens a pre-filled GitHub issue).
- Back closes an open form instead of leaving the page behind it.
- Pressing Check repeatedly no longer starts the same lookup again.
- Names and notes in right-to-left scripts display correctly.
- The CLI credits Transport Canada's open licence and strips terminal control codes from
  NHTSA text.

## 2026-10-15

- **My records:** keep your own service, odometer and registration history for a vehicle,
  with odometer-rollback and registration-expiry warnings, copy as text, and backups.
- Redesigned as an installable Home Screen app with light and dark themes.

## 2026-10-14

- Recalls that explicitly name a different configuration (drive, engine, fuel, roof height)
  are marked as probably not applying, and kept in their own section.
- The web page links to Transport Canada's recall search instead of failing to load it.

## 2026-10-13

- First release: VIN check digit, NHTSA decoding, US and Canadian recalls, owner complaints
  and crash ratings, as a CLI and a mobile web page.
