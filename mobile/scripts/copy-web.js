// Copies the web page from the repo root into www/, which Capacitor bundles into the app.
// The app runs these files from the phone, not from a website, so it works offline apart
// from the NHTSA lookups. Run before `cap sync` (npm run sync does both).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(mobile, '..');
const www = join(mobile, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www);
for (const f of ['app.css', 'app.js', 'native.js', 'privacy.html']) cpSync(join(root, f), join(www, f));
for (const d of ['src', 'fonts', 'icons']) cpSync(join(root, d), join(www, d), { recursive: true });

// The manifest is for "Add to Home Screen" on the website; the app doesn't need it.
const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace(/\s*<link rel="manifest"[^>]*>/, '');
writeFileSync(join(www, 'index.html'), html);
console.log(`Copied the web page into ${www}`);
