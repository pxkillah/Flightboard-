#!/usr/bin/env node
// Builds the Car Report website (decision 17) into dist/site: the landing page in English
// (/) and French (/fr/) from site/page.html and site/strings.js, plus the privacy and support
// pages from the repo root, the icons, one font and the screenshots. Cloudflare Pages runs
// this on every push (docs/website.md). The site has no scripts and loads nothing from
// other sites; _headers gives it real security headers.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../site/strings.js';
import { SITE } from '../site/config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(root, 'dist', 'site');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const template = readFileSync(join(root, 'site', 'page.html'), 'utf8');
const LANGS = { en: { dir: '', root: './', other: 'fr' }, fr: { dir: 'fr', root: '../', other: 'en' } };

function storeLinks(code, t) {
  const links = [['appStore', 'appstore'], ['googlePlay', 'googleplay']].filter(([k]) => SITE[k]).map(([k, file]) => {
    const badge = `img/badge-${file}-${code}.svg`;
    const inner = existsSync(join(root, 'site', badge))
      ? `<img src="${LANGS[code].root}${badge}" alt="${esc(t[k])}" height="48">`
      : esc(t[k]);
    return `<a class="store${inner.startsWith('<img') ? ' badge' : ''}" href="${esc(SITE[k])}" rel="noopener">${inner}</a>`;
  });
  return links.length ? `<div class="stores">${links.join('')}</div>` : `<p class="soon">${esc(t.soon)}</p>`;
}

function headLinks(code) {
  if (!SITE.url) return '';
  const href = (c) => `${SITE.url}/${LANGS[c].dir ? `${LANGS[c].dir}/` : ''}`;
  return [
    `<link rel="canonical" href="${esc(href(code))}">`,
    `<link rel="alternate" hreflang="en" href="${esc(href('en'))}">`,
    `<link rel="alternate" hreflang="fr" href="${esc(href('fr'))}">`,
    `<link rel="alternate" hreflang="x-default" href="${esc(href('en'))}">`,
    `<meta property="og:url" content="${esc(href(code))}">`,
    `<meta property="og:image" content="${esc(`${SITE.url}/img/${code}-listings.webp`)}">`,
  ].join('\n');
}

export function renderPage(code) {
  const t = STRINGS[code];
  const L = LANGS[code];
  const fill = (s) => String(s).replace(/\{\{price\}\}/g, SITE.price[code]);
  const values = {
    ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, esc(fill(v))])),
    root: L.root,
    code,
    otherLangCode: L.other,
    price: esc(SITE.price[code]),
    email: esc(SITE.email),
    year: String(new Date().getFullYear()),
    privacyAnchor: code === 'fr' ? '#fr' : '',
    supportAnchor: code === 'fr' ? '#fr' : '',
    headLinks: headLinks(code),
    stores: storeLinks(code, t),
  };
  const html = template.replace(/\{\{(\w+)\}\}/g, (whole, key) => {
    if (!(key in values)) throw new Error(`site/page.html uses {{${key}}}, which site/strings.js (${code}) doesn't have`);
    return values[key];
  });
  return html;
}

const HEADERS = `/*
  Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
/img/*
  Cache-Control: public, max-age=604800
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;

export function build(dest = out) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, 'fr'), { recursive: true });
  for (const code of Object.keys(LANGS)) writeFileSync(join(dest, LANGS[code].dir, 'index.html'), renderPage(code));
  cpSync(join(root, 'site', 'site.css'), join(dest, 'site.css'));
  cpSync(join(root, 'site', 'img'), join(dest, 'img'), { recursive: true });
  mkdirSync(join(dest, 'icons'));
  for (const f of ['icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) cpSync(join(root, 'icons', f), join(dest, 'icons', f));
  mkdirSync(join(dest, 'fonts'));
  for (const f of ['barlow-semi-condensed-latin-700-normal.woff2', 'LICENSE-Barlow.txt']) cpSync(join(root, 'fonts', f), join(dest, 'fonts', f));
  // The privacy and support pages are the same files the app ships; their "Car Report" link
  // goes to ./, which on the website is the landing page.
  for (const f of ['privacy.html', 'support.html']) cpSync(join(root, f), join(dest, f));
  writeFileSync(join(dest, '_headers'), HEADERS);
  writeFileSync(join(dest, 'robots.txt'), `User-agent: *\nAllow: /\n`);
  writeFileSync(join(dest, '404.html'), renderPage('en').replace(/<main id="main">[\s\S]*<\/main>/, `<main id="main"><section class="hero wrap"><div class="hero-text"><h1>Page not found · Page introuvable</h1><p class="lede"><a href="/">Car Report</a> · <a href="/fr/">Français</a></p></div></section></main>`));
  return dest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`Built the website in ${build()}`);
