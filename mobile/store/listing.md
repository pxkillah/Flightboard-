# Car Report: store listing and questionnaires

Copy these into App Store Connect and Play Console. Screenshots are in `screenshots/ios`
(1320 × 2868, the 6.9-inch iPhone size) and `screenshots/android` (1080 × 1920), numbered
in the order to upload them, in English (`en-*`) and French (`fr-*`). They show the real app
with sample records.

Support email: **creport88@gmail.com**. Once the website is on its domain (docs/website.md), the addresses are `https://<domain>/` (marketing URL), `https://<domain>/privacy.html` (privacy policy) and `https://<domain>/support.html` (support).

## Names and categories

| | English (Canada) | French (Canada) |
|---|---|---|
| App name (30 max) | Car Report | Car Report |
| iOS subtitle (30 max) | VIN check, recalls, logbook | NIV, rappels et carnet |
| Google short description (80 max) | Check any VIN for recalls, complaints and crash ratings. Keep your car's log. | Rappels, plaintes et cotes de sécurité de tout NIV, et le carnet de votre auto. |
| iOS keywords (100 max) | vin,decoder,recall,nhtsa,used car,car history,odometer,maintenance,service log,crash rating,safety | niv,décodeur,rappel,nhtsa,auto usagée,odomètre,entretien,carnet,sécurité,véhicule |

- Keywords and the subtitle must not name other companies or apps (Apple guideline 2.3.7), so no "Carfax" there; the description may mention it only in the not-affiliated sentence.
- App Store category: Utilities (secondary: Reference). Google Play category: Auto & Vehicles.
- Price: free to download, with one in-app purchase: **Full report** (`car_report_full`, consumable, CA$11.99), which opens the full report for one VIN. No ads, no subscriptions.
- Privacy policy URL: the hosted `privacy.html`. Support URL: the hosted `support.html`.

## Description (English)

Check any car, truck or SUV by its VIN, with no account.

Type the 17-character VIN or scan the barcode on the driver's door frame. Car Report shows what the VIN says (year, make, model, engine, drive type and where it was built) and warns you, free, when a recall says not to drive the vehicle until it's repaired. It also tells you how many times the vehicle was advertised for sale.

The full report for that VIN (one-time purchase, CA$11.99) adds:

• Sale listing history: when and where the vehicle was advertised, new or used, the asking prices and the advertised mileage, with a warning if the mileage ever went down
• The advertised mileage checked against your own odometer readings
• Recalls for that model, with the ones that probably don't apply to this vehicle flagged and explained
• Owner complaints filed with NHTSA: crashes, fires, injuries and the most reported problems
• Crash-test ratings

Keep your own logbook too, free: oil changes and repairs, odometer readings in km or miles, and registration renewals for any Canadian province or US state. Car Report charts your mileage, warns if the odometer ever goes backwards, shows when a registration is about to expire, and lets you share the history with a buyer or mechanic, or export it as a spreadsheet.

Private by design: your records stay on your phone. There are no accounts, ads or tracking. The VIN you check goes to NHTSA and to the Car Report server to look up the vehicle; Apple or Google handles payment.

In English and French.

Sources: recall, complaint and crash-rating data comes from the U.S. National Highway Traffic Safety Administration (NHTSA). Recalls are listed by model: confirm with a dealer whether one applies to your vehicle and whether it was repaired. Sale listings come from MarketCheck; prices and mileage are as advertised, not verified. Car Report is not affiliated with or endorsed by NHTSA, Transport Canada, MarketCheck, Carfax or any government agency. It doesn't include accident, lien or ownership history.

## Description (français)

Vérifiez n'importe quelle auto, camionnette ou VUS par son NIV, sans compte.

Tapez le NIV de 17 caractères ou lisez le code-barres dans le cadre de la portière du conducteur. Car Report affiche ce que dit le NIV (année, marque, modèle, moteur, traction et lieu d'assemblage) et vous avertit gratuitement quand un rappel demande de ne pas conduire le véhicule avant la réparation. Il indique aussi combien de fois le véhicule a été annoncé à vendre.

Le rapport complet de ce NIV (achat unique, 11,99 $ CA) ajoute :

• L'historique des annonces de vente : quand et où le véhicule a été annoncé, neuf ou d'occasion, les prix demandés et le kilométrage annoncé, avec un avertissement si le kilométrage a déjà baissé
• Le kilométrage annoncé comparé à vos propres relevés d'odomètre
• Les rappels pour ce modèle, avec ceux qui ne s'appliquent probablement pas à ce véhicule signalés et expliqués
• Les plaintes de propriétaires déposées auprès de la NHTSA : accidents, incendies, blessures et problèmes les plus signalés
• Les cotes de sécurité aux essais de collision

Tenez aussi votre propre carnet, gratuitement : vidanges et réparations, relevés d'odomètre en km ou en milles, et renouvellements d'immatriculation dans toute province canadienne ou tout État américain. Car Report trace votre kilométrage, vous avertit si l'odomètre recule, indique quand l'immatriculation arrive à échéance, et vous permet de partager l'historique avec un acheteur ou un mécanicien, ou de l'exporter en tableur.

Confidentiel par conception : vos entrées restent sur votre téléphone. Aucun compte, aucune publicité, aucun pistage. Le NIV vérifié est envoyé à la NHTSA et au serveur de Car Report pour trouver le véhicule; Apple ou Google s'occupe du paiement.

En français et en anglais.

Sources : les données de rappels, de plaintes et de cotes de sécurité viennent de la National Highway Traffic Safety Administration (NHTSA) des États-Unis. Les rappels sont classés par modèle : confirmez auprès d'un concessionnaire si un rappel s'applique à votre véhicule et s'il a été effectué. Les annonces de vente viennent de MarketCheck; les prix et le kilométrage sont tels qu'annoncés, sans vérification. Car Report n'est pas affilié à la NHTSA, à Transports Canada, à MarketCheck, à Carfax ni à aucun organisme gouvernemental, et n'est pas approuvé par eux. Il ne contient pas d'historique d'accidents, de privilèges ou de propriétaires.

## Apple: App Privacy

- Data collection: **Yes**, by the Car Report server (decision 16), declared in the privacy
  manifest (`ios/App/App/PrivacyInfo.xcprivacy`) too:
  - **Purchases → Purchase History**: the App Store reference to each report bought, kept with
    its VIN so the report can be opened again. Not linked to the user's identity; not used for
    tracking; purpose **App Functionality**.
  - **Other Data → Other Data Types**: the VIN checked or bought. Not linked; not tracking;
    **App Functionality**.
  - The server never stores IP addresses: it keeps a keyed one-way hash of one for daily abuse
    limits, deleted after two days. Feedback is an email the person sends from their own mail app.
- Tracking: none. The privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) says the same.
- Export compliance: uses only standard HTTPS, so it's exempt
  (`ITSAppUsesNonExemptEncryption` is set to NO in Info.plist).
- Age rating: answer "None" to every content question → 4+.

## Apple: notes for the reviewer

> Car Report needs no login. To try it, tap "See an example report" (NHTSA's sample VIN
> 1HGCM82633A004352): the example shows the full report free. Any other VIN shows the vehicle,
> safety warnings and My records free, and a "Get the full report" button: the consumable
> in-app purchase `car_report_full`, which opens the full report (sale listing history,
> recalls, complaints, crash ratings) for that one VIN. A sandbox purchase works; our server
> confirms it with the App Store Server API. Try VIN 1FTBR1X87LKA22229, which has sale
> listings. Sale listings come from MarketCheck, which has approved this use. Every feature is
> visible in the app, and all code ships in the app bundle (nothing is downloaded or changed
> after review).
>
> - Report: VIN details, recalls (ones that probably don't apply to this vehicle are flagged
>   with the reason), owner complaints and crash ratings, from NHTSA's public APIs. If a VIN
>   fails its check digit, the app explains why and offers "Look up anyway" (some imports skip it).
> - My records: service, odometer and registration entries, stored on the device only. Save
>   backup and Export CSV open the share sheet; Restore reads a backup file; Copy history copies text.
> - After the third saved record, the app may show Apple's standard rating prompt (SKStoreReviewController).
> - Send feedback (bottom of the screen) opens the user's mail app with a pre-filled email to creport88@gmail.com.
> - English and French (switch at the bottom of the screen). Privacy policy: "Privacy and data notes" at the bottom.

## Creative assets (App Store guideline 2.3.14)

If you add App Store creative assets (images for the product page header or search results),
they must show what Car Report actually does: no prices or "free" badges, no other apps'
names or logos, and no claims you can't prove ("the best", "#1", "more accurate than…").
The screenshots in `screenshots/` already follow this.

## Google Play: App content answers

- Privacy policy: the hosted `privacy.html`.
- Ads: **No**.
- App access: **All functionality is available without special access.**
- Content rating (IARC): category "Reference, News, or Educational"; answer No to every
  content question → rated for everyone.
- Target audience: **18 and over** (the app isn't aimed at children).
- News app: No. Government app: No (it shows public government data and says so in the
  description, with the "not affiliated" disclaimer Google requires).
- Data safety:
  - Does the app collect or share user data? **Yes, collected** (not shared): **Financial info →
    Purchase history** (the Google Play reference to each report bought, stored only as a
    one-way hash with its VIN; required; purpose App functionality). The VIN is about a
    vehicle, not a person; if you'd rather be cautious, also declare it under **Personal info →
    Other info**. Sending the VIN to NHTSA is a user-initiated transfer, not sharing.
  - Payments go through Google Play billing; the app never sees card details.
  - Is data encrypted in transit? Yes (HTTPS only).
  - Can users delete their data? Yes: in the app ("Erase all Car Report data on this device"),
    or by uninstalling.
