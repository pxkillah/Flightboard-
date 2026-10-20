// Run before building a store release: npm run check-release. Fails (exit 1) on anything
// that would ship a broken or incomplete app. See docs/app-release.md.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(mobile, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const problems = [];

const email = read('src/feedback.js').match(/export const SUPPORT_EMAIL = '([^']*)'/)?.[1];
if (!email) problems.push('src/feedback.js: set SUPPORT_EMAIL (feedback, support and privacy requests go there).');
else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push(`src/feedback.js: SUPPORT_EMAIL "${email}" isn't an email address.`);
for (const f of ['privacy.html', 'support.html']) {
  if (read(f).includes('SUPPORT_EMAIL_HERE')) problems.push(`${f}: replace SUPPORT_EMAIL_HERE with the support address.`);
  else if (email && !read(f).includes(email)) problems.push(`${f}: doesn't show the support address ${email}.`);
}

// Paid reports need the server (docs/server.md): its address in src/paid.js and in the page's
// security policy, and the same product ID as the server.
const api = read('src/paid.js').match(/export const REPORT_API = '([^']*)'/)?.[1];
const product = read('src/paid.js').match(/export const PRODUCT_ID = '([^']*)'/)?.[1];
if (!api) problems.push('src/paid.js: set REPORT_API to the server address (docs/server.md), or the app gives every report away.');
else if (!/^https:\/\/[^/]+$/.test(api)) problems.push(`src/paid.js: REPORT_API "${api}" must be https://host with no path.`);
else if (!new RegExp(`connect-src [^;]*${api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ ;]`).test(read('index.html'))) problems.push(`index.html: add ${api} to connect-src in the Content-Security-Policy.`);
if (read('server/wrangler.toml').match(/^PRODUCT_ID = "([^"]+)"/m)?.[1] !== product) problems.push('server/wrangler.toml: PRODUCT_ID must match src/paid.js.');

// www/ must be a fresh copy of the page, or the app ships old code.
for (const f of ['index.html', 'app.js', 'app.css', 'native.js', 'privacy.html']) {
  const copy = join(mobile, 'www', f);
  if (!existsSync(copy)) { problems.push('www/ is missing: run npm run sync.'); break; }
  const want = f === 'index.html' ? read(f).replace(/\s*<link rel="manifest"[^>]*>/, '') : read(f);
  if (readFileSync(copy, 'utf8') !== want) { problems.push(`www/${f} is out of date: run npm run sync.`); break; }
}

// Both stores need the version to go up with every upload.
const gradle = readFileSync(join(mobile, 'android/app/build.gradle'), 'utf8');
const xcode = readFileSync(join(mobile, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const android = gradle.match(/versionName "([^"]+)"/)?.[1];
const ios = [...new Set([...xcode.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]))];
if (ios.length !== 1 || ios[0] !== android) problems.push(`Versions differ: Android ${android}, iOS ${ios.join(' / ')}. Set the same version in both.`);

if (problems.length) {
  console.error(`Not ready to release:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Ready to build version ${android}.`);
