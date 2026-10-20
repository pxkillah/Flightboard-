// Phone-app features. In the iOS and Android app, Capacitor injects a bridge as
// window.Capacitor, and these call its native plugins through it (no build step needed).
// On the website there is no bridge, and each function falls back to the browser.
const cap = () => globalThis.Capacitor;
export const isApp = () => Boolean(cap()?.isNativePlatform?.());
export const platform = () => (isApp() ? cap().getPlatform() : 'web');
const call = (plugin, method, options = {}) => cap().nativePromise(plugin, method, options);
const cancelled = (e) => /cancel/i.test(String(e?.message ?? e));

// Saves text as a file. Returns 'saved', or 'cancelled' when the person closed the share
// sheet without picking anything. The app can't download files, so it writes the file to
// its cache and opens the share sheet (Save to Files, AirDrop, email...).
export async function saveFile(name, text, type) {
  if (!isApp()) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'saved';
  }
  const { uri } = await call('Filesystem', 'writeFile', { path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  try {
    await call('Share', 'share', { title: name, files: [uri] });
    return 'saved';
  } catch (e) {
    if (cancelled(e)) return 'cancelled';
    throw e;
  }
}

// iOS can clear a web view's storage when the phone runs low on space, so the app keeps a
// copy of each saved value in the platform's own settings store (UserDefaults or
// SharedPreferences). restoreSaved puts it back when the web view's copy has gone.
export async function restoreSaved(keys) {
  if (!isApp()) return;
  for (const key of keys) {
    try {
      const { value } = await call('Preferences', 'get', { key });
      if (value !== null && value !== undefined && localStorage.getItem(key) === null) localStorage.setItem(key, value);
    } catch { /* keep what the web view has */ }
  }
}
export function mirrorSaved(key, value) {
  if (!isApp()) return;
  const done = value === null ? call('Preferences', 'remove', { key }) : call('Preferences', 'set', { key, value });
  done.catch(() => { /* the web view's copy is still there */ });
}

// Scans a barcode with the camera and returns what it read: an array of strings, empty when
// the person closed the scanner. Throws an Error whose code is 'denied' (no camera access)
// or 'installing' (Android is still downloading the scanner, a one-time step).
export const canScan = () => isApp();
export async function scanBarcodes() {
  if (platform() === 'android') {
    const { available } = await call('BarcodeScanner', 'isGoogleBarcodeScannerModuleAvailable');
    if (!available) {
      await call('BarcodeScanner', 'installGoogleBarcodeScannerModule');
      throw Object.assign(new Error('installing'), { code: 'installing' });
    }
  } else {
    // Android's Google scanner runs in its own screen and needs no camera permission.
    const { camera } = await call('BarcodeScanner', 'requestPermissions');
    if (camera !== 'granted' && camera !== 'limited') throw Object.assign(new Error('denied'), { code: 'denied' });
  }
  try {
    // VIN labels use Code 39 (older door frames) or Data Matrix; the rest cover other labels.
    const { barcodes } = await call('BarcodeScanner', 'scan', { formats: ['CODE_39', 'DATA_MATRIX', 'CODE_128', 'QR_CODE', 'PDF_417'] });
    return (barcodes ?? []).map((b) => b.rawValue ?? b.displayValue ?? '');
  } catch (e) {
    if (cancelled(e)) return [];
    throw e;
  }
}

// Shows the App Store or Google Play rating card in the app. The system decides whether it
// appears and never says, so there's nothing to report back.
export function askForRating() {
  if (isApp()) call('InAppReview', 'requestReview').catch(() => { /* not shown; that's fine */ });
}

// ---------- In-app purchase (@capgo/native-purchases) ----------
// Purchases stay unfinished until the server has confirmed them (paid reports, decision 16),
// so one the app didn't hear about, because it was closed mid-purchase, is delivered again.
const STORE_PLUGIN = 'NativePurchases';
// A purchase as the app keeps it. accountToken is the random ID the app attached when buying,
// which says which VIN it was for if the app was closed before it could note that itself.
function proofOf(t) {
  const base = { accountToken: t?.appAccountToken ?? null };
  return platform() === 'ios'
    ? { ...base, platform: 'ios', transactionId: String(t?.transactionId ?? '') }
    : { ...base, platform: 'android', purchaseToken: String(t?.purchaseToken ?? '') };
}
export function configurePurchases() {
  return call(STORE_PLUGIN, 'configure', { autoFinishTransactions: false }).catch(() => { /* older plugin: config file sets it */ });
}
// The store's price for the product, in the person's own currency ("11,99 $"), or null.
export async function productPrice(id) {
  const { products } = await call(STORE_PLUGIN, 'getProducts', { productIdentifiers: [id], productType: 'inapp' });
  return (products ?? []).find((p) => p.identifier === id)?.priceString ?? null;
}
// Opens the store's payment sheet. Returns the purchase, or null when the person cancelled.
export async function buyProduct(id, accountToken) {
  try {
    const t = await call(STORE_PLUGIN, 'purchaseProduct', {
      productIdentifier: id, productType: 'inapp', appAccountToken: accountToken, isConsumable: false, autoAcknowledgePurchases: false,
    });
    return proofOf(t);
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}
// Purchases of the product the store still holds open: unfinished on iOS, not yet consumed on
// Android. Each is either waiting for the server, or bought but never used for a VIN.
export async function openPurchases(id) {
  const { purchases } = await call(STORE_PLUGIN, 'getPurchases', { productType: 'inapp' });
  return (purchases ?? []).filter((t) => t.productIdentifier === id && (platform() !== 'ios' || t.needsFinish !== false)).map(proofOf);
}
// iOS: tells StoreKit the report was delivered. Android purchases are consumed by the server.
export function finishPurchase(proof) {
  if (proof?.platform !== 'ios') return Promise.resolve();
  return call(STORE_PLUGIN, 'finishTransaction', { transactionId: proof.transactionId }).catch(() => { /* delivered again next launch */ });
}
