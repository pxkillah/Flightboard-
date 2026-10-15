# Car Report: store listing and questionnaires

Copy these into App Store Connect and Play Console. Screenshots are in `screenshots/ios`
(1320 × 2868, the 6.9-inch iPhone size) and `screenshots/android` (1080 × 1920), numbered
in the order to upload them, in English (`en-*`) and French (`fr-*`). They show the real app
with sample records.

Replace `SUPPORT_EMAIL` and the two page addresses once they exist (docs/app-release.md).

## Names and categories

| | English (Canada) | French (Canada) |
|---|---|---|
| App name (30 max) | Car Report | Car Report |
| iOS subtitle (30 max) | VIN check, recalls, logbook | NIV, rappels et carnet |
| Google short description (80 max) | Check any VIN for recalls, complaints and crash ratings. Keep your car's log. | Rappels, plaintes et cotes de sécurité de tout NIV, et le carnet de votre auto. |
| iOS keywords (100 max) | vin,decoder,recall,nhtsa,carfax,used car,odometer,maintenance,service log,crash rating,safety | niv,décodeur,rappel,nhtsa,auto usagée,odomètre,entretien,carnet,sécurité,véhicule |

- App Store category: Utilities (secondary: Reference). Google Play category: Auto & Vehicles.
- Price: free. No in-app purchases, no ads.
- Privacy policy URL: the hosted `privacy.html`. Support URL: the hosted `support.html`.

## Description (English)

Check any car, truck or SUV by its VIN, free, with no account.

Type the 17-character VIN or scan the barcode on the driver's door frame, and Car Report shows:

• Recalls for that model, with the ones that probably don't apply to this vehicle flagged and explained
• Owner complaints filed with NHTSA: crashes, fires, injuries and the most reported problems
• Crash-test ratings
• What the VIN says: year, make, model, engine, drive type, weight class and where it was built
• A warning when a recall says not to drive the vehicle until it's repaired

Keep your own logbook too: oil changes and repairs, odometer readings in km or miles, and registration renewals for any Canadian province or US state. Car Report charts your mileage, warns if the odometer ever goes backwards, shows when a registration is about to expire, and lets you share the history with a buyer or mechanic, or export it as a spreadsheet.

Private by design: your records stay on your phone. There are no accounts, ads or tracking. The only thing that leaves your phone is the VIN you check, which goes to NHTSA.

In English and French.

Source: recall, complaint and crash-rating data comes from the U.S. National Highway Traffic Safety Administration (NHTSA). Recalls are listed by model: confirm with a dealer whether one applies to your vehicle and whether it was repaired. Car Report is not affiliated with or endorsed by NHTSA, Transport Canada, Carfax or any government agency. It doesn't include accident, lien or ownership history.

## Description (français)

Vérifiez n'importe quelle auto, camionnette ou VUS par son NIV, gratuitement et sans compte.

Tapez le NIV de 17 caractères ou lisez le code-barres dans le cadre de la portière du conducteur, et Car Report affiche :

• Les rappels pour ce modèle, avec ceux qui ne s'appliquent probablement pas à ce véhicule signalés et expliqués
• Les plaintes de propriétaires déposées auprès de la NHTSA : accidents, incendies, blessures et problèmes les plus signalés
• Les cotes de sécurité aux essais de collision
• Ce que dit le NIV : année, marque, modèle, moteur, traction, catégorie de poids et lieu d'assemblage
• Un avertissement quand un rappel demande de ne pas conduire le véhicule avant la réparation

Tenez aussi votre propre carnet : vidanges et réparations, relevés d'odomètre en km ou en milles, et renouvellements d'immatriculation dans toute province canadienne ou tout État américain. Car Report trace votre kilométrage, vous avertit si l'odomètre recule, indique quand l'immatriculation arrive à échéance, et vous permet de partager l'historique avec un acheteur ou un mécanicien, ou de l'exporter en tableur.

Confidentiel par conception : vos entrées restent sur votre téléphone. Aucun compte, aucune publicité, aucun pistage. La seule chose qui quitte votre téléphone est le NIV vérifié, envoyé à la NHTSA.

En français et en anglais.

Source : les données de rappels, de plaintes et de cotes de sécurité viennent de la National Highway Traffic Safety Administration (NHTSA) des États-Unis. Les rappels sont classés par modèle : confirmez auprès d'un concessionnaire si un rappel s'applique à votre véhicule et s'il a été effectué. Car Report n'est pas affilié à la NHTSA, à Transports Canada, à Carfax ni à aucun organisme gouvernemental, et n'est pas approuvé par eux. Il ne contient pas d'historique d'accidents, de privilèges ou de propriétaires.

## Apple: App Privacy

- Data collection: **No, we do not collect data from this app.** The VIN goes straight from
  the phone to NHTSA when the person asks for a report; it never reaches the developer.
  Feedback is an email the person sends from their own mail app.
- Tracking: none. The privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) says the same.
- Export compliance: uses only standard HTTPS, so it's exempt
  (`ITSAppUsesNonExemptEncryption` is set to NO in Info.plist).
- Age rating: answer "None" to every content question → 4+.

## Apple: notes for the reviewer

> Car Report needs no login. To try it, enter the sample VIN 1HGCM82633A004352 (NHTSA's
> documentation example), or tap the barcode button to scan the VIN label on a vehicle's door
> frame. Reports come from NHTSA's public APIs. "My records" stores entries on the device only;
> Save backup and Export CSV use the share sheet. The app is available in English and French
> (switch at the bottom of the screen).

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
  - Does the app collect or share user data? **No.** Looking up a VIN sends it to NHTSA at the
    person's request, which Google counts as a user-initiated transfer, not sharing.
  - Is data encrypted in transit? Yes (HTTPS only).
  - Can users delete their data? Yes: in the app ("Erase all Car Report data on this device"),
    or by uninstalling.
