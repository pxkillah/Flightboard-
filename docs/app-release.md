# Releasing Car Report to the App Store and Google Play

The phone app is the web page in the repo root, bundled into native iOS and Android apps by
[Capacitor](https://capacitorjs.com) in `mobile/`. Everything here runs on the owner's Mac.
The store text, privacy answers and screenshots are in `mobile/store/`.

## What only the owner can do (once)

1. **Apple Developer Program** (US$99 a year): enrol at developer.apple.com/programs with
   your Apple ID. Enrolling as an individual shows your legal name in the App Store as the
   seller; an organisation needs a D-U-N-S number but shows the company name (COMP-10).
2. **Google Play Console** (US$25 once): sign up at play.google.com/console. Google verifies
   your identity. New personal accounts must run a **closed test with at least 12 testers for
   14 days** before the app can go public, so start that early.
3. **Support email**: creport88@gmail.com (done 2026-10-16). It's in `src/feedback.js`
   (`SUPPORT_EMAIL`), `privacy.html` and `support.html`. Use the same address as the contact
   email in App Store Connect and Play Console.
4. **Host the two pages**: the website (`docs/website.md`) publishes `privacy.html` and
   `support.html` at your domain. Their addresses go in both store listings.
5. Turn on two-step sign-in for the Apple ID and the Google account (both stores require it).
6. **Selling reports** (decision 16). Before any purchase can happen:
   - App Store Connect → Business: sign the **Paid Apps Agreement** and fill in tax and bank
     details. Apply for the **App Store Small Business Program** (15% commission instead of 30%).
   - Play Console → Monetization setup: create the **payments profile** (merchant account) with
     tax and bank details. Google charges 15% on the first US$1M a year.
   - Keep MarketCheck's written approval to resell listing history (received 2026-10-20) with
     your records; App Review may ask about the data source.
   - Set up the server: `docs/server.md`. The app gives reports away until it's set.

## Tools on the Mac (once)

- **Xcode** from the Mac App Store, then open it once to install its components.
- **CocoaPods**: `brew install cocoapods` (install Homebrew from brew.sh first if needed).
- **Android Studio** from developer.android.com/studio; on first launch accept the SDK setup.
- **Node.js 22 or later** from nodejs.org.

## Get the code and build the app files

```
git clone https://github.com/pxkillah/Flightboard-.git
cd Flightboard-/mobile
npm ci                  # installs Capacitor and its plugins (exact versions from package-lock.json)
npm run sync            # copies the page into www/ and updates the iOS and Android projects
npm run check-release   # must say "Ready to build" before you upload anything
```

Run `npm run sync` again after every change to the page (`index.html`, `app.js`, `app.css`,
`native.js`, `src/`, `privacy.html`), or the app ships old code. `check-release` catches that.

## Version numbers

Every upload needs a higher build number than the last one, in both stores.

- Android: `mobile/android/app/build.gradle`, `versionCode` (add 1 each upload) and
  `versionName` (what people see, e.g. `1.0.1`).
- iOS: in Xcode, select the App target → General → Version (same as `versionName`) and
  Build (add 1 each upload).

## iPhone: build and upload

1. `open ios/App/App.xcworkspace` (the workspace, not the `.xcodeproj`).
2. Select the **App** target → **Signing & Capabilities** → tick "Automatically manage
   signing" and choose your team. The bundle ID is `com.pxkillah.carreport`.
3. Try it: plug in your iPhone, pick it as the destination, press Run. Check a VIN, scan the
   barcode on a car's door frame, add a record, save a backup, change the language. To test
   buying: App Store Connect → Users and Access → **Sandbox** → add a test account, sign in to
   it on the iPhone (Settings → App Store → Sandbox Account), and buy a report: it's free.
4. In App Store Connect (appstoreconnect.apple.com) → Apps → **+** → New App: platform iOS,
   name **Car Report** (if it's taken, try "Car Report: VIN & Recalls"; the bundle ID stays),
   primary language English (Canada), bundle ID `com.pxkillah.carreport`, SKU `carreport`.
   Then the app → Monetization → **In-App Purchases** → **+**: type **Consumable**, reference
   name "Full report", product ID **`car_report_full`**, price **CA$11.99** (Apple sets the
   other countries' prices from it; check them), display name "Full report" and description
   "The full report for one VIN: sale listings, recalls, complaints and crash ratings", in
   English and French, and a screenshot of the locked report for review.
5. Back in Xcode: destination **Any iOS Device** → Product → **Archive** → Distribute App →
   App Store Connect → Upload.
6. In App Store Connect, fill in the listing from `mobile/store/listing.md`, add the
   screenshots from `mobile/store/screenshots/ios/`, answer App Privacy as written in
   `listing.md` (the server receives the VIN and the purchase), add French (Canada) as a
   localization, and attach the in-app purchase to the version before submitting.
7. Test the uploaded build with **TestFlight** first, then Submit for Review.

## Android: build and upload

1. Open Android Studio → Open → `Flightboard-/mobile/android`. Wait for Gradle to finish.
2. Try it on a phone (enable Developer options → USB debugging) or an emulator: Run ▶.
3. **Upload key** (once): Build → Generate Signed App Bundle → Android App Bundle → Create
   new key store. Save the `.jks` file and both passwords in your password manager, **outside
   the repo** (`*.jks` is git-ignored). Losing it isn't fatal with Play App Signing, but
   resetting it takes a support request.
4. Build → Generate Signed App Bundle → release → the `.aab` file appears in
   `android/app/release/`.
5. In Play Console → Create app: name **Car Report**, default language English (Canada),
   app, free (it's free to download, with in-app purchases). Accept Play App Signing. Once the
   first `.aab` is uploaded: Monetize → Products → **In-app products** → Create: product ID
   **`car_report_full`**, name "Full report", price **CA$11.99**, in English and French; set
   it Active. Setup → License testing: add your Google account so test purchases are free.
6. Fill in the listing, Data safety and content rating from `mobile/store/listing.md`, with
   screenshots from `mobile/store/screenshots/android/`, and add French (Canada).
7. Testing → **Closed testing** → create a track, upload the `.aab`, add at least 12 testers
   (their Google account emails), and keep it running 14 days. Then apply for production.

## After release

- Both stores show crash reports from people who agreed to share diagnostics with
  developers: App Store Connect → TestFlight/App Analytics, and Play Console → Quality →
  Android vitals. The app itself sends no diagnostics (decision 3).
- Sales and refunds: App Store Connect → Sales and Trends / Payments; Play Console → Order
  management. A refunded purchase stops opening its report's listings (the server checks the
  store each time), but what's already on the person's phone stays.
- **There is no instant rollback.** Release to a fraction of users first: Play Console's
  staged rollout (start at 10%, halt it if something breaks) and the App Store's phased
  release (pause it). A fix needs a new build and review; Apple offers expedited review for
  serious bugs. See `docs/runbook.md`.
- Every year Google Play requires targeting a recent Android version and Apple requires a
  recent Xcode. Capacitor's yearly major version handles both; Dependabot opens the PRs.
