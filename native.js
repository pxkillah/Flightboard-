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
