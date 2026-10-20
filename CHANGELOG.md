# Changelog

Changes people using VIN Report would notice. Newest first.

## Unreleased

- **Full report in the app: CA$11.99 per VIN.** In the iPhone and Android app, the full report
  (sale listing history from MarketCheck, recalls, complaints and crash ratings) is a one-time
  purchase through the App Store or Google Play. Before buying you see the vehicle, how many
  sale listings it has, and any do-not-drive warning, free; My records stays free. A purchase
  interrupted by a lost connection or a closed app is finished the next time the app opens.
  The website is unchanged.
- **Car Report for iPhone and Android.** The page is now also a phone app, with:
  - a scan button that reads the VIN barcode on the door frame or windshield;
  - backups and spreadsheets that open the share sheet (Files, AirDrop, email…);
  - saved records that survive iOS clearing the app's web storage.
  - after your third saved record, the app may ask you to rate it (once, then at most every 4 months).
- The app is now called **Car Report**.
- Send feedback opens an email instead of a GitHub issue.
- A privacy policy page, in English and French, linked from the footer.
- **Clear recall dates.** Recall dates from NHTSA and Transport Canada are shown the same
  way (YYYY-MM-DD on the command line), so 05/06/2020 can't be read two ways.
- **Listing history (optional, your own MarketCheck key).** The report can add the car's
  online sale listings: dates, dealer, asking prices and advertised mileage, with a warning
  when an advertised reading went down.
  - On the command line, from `MARKETCHECK_API_KEY` or `~/.marketcheck_key`.
  - On the web page, in a new Listing history panel: add your key once (it stays in that
    browser), then tap Show listing history. The result is kept on the device, so reopening
    the report costs no calls, and your latest odometer reading in My records is checked
    against the ads.
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
