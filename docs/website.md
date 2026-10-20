# The Car Report website and domain

The website is a landing page for the app, in English (`/`) and French (`/fr/`), plus the
privacy and support pages both app stores ask for (decision 17). It's built from `site/` by
`scripts/build-site.js` into `dist/site`, and hosted on Cloudflare Pages next to the server
(`docs/server.md`). It has no scripts and loads nothing from other sites.

```
node scripts/build-site.js           # builds dist/site
cd dist/site && python3 -m http.server 8000   # look at it on http://localhost:8000
```

Text is in `site/strings.js` (both languages), the layout in `site/page.html` and
`site/site.css`, settings in `site/config.js`, and the screenshots in `site/img/`.

## 1. Buy the domain (you, about US$10 a year)

Buying needs your payment details and puts the domain in your name, so only you can do it.

1. Sign in to Cloudflare (the same account as the server), then **Domain Registration →
   Register Domains**.
2. Search for a name. `carreport.com` is very likely taken; try, in this order:
   `getcarreport.com`, `carreportapp.com`, `mycarreport.com`, `carreport.ca`. Cloudflare shows
   at once whether each is free and its yearly price (it charges what the registry charges,
   with no markup).
3. Before you buy, search the name with "car" and "report" on Google and in the
   App Store, and check the Canadian and US trademark databases (ised-isde.canada.ca,
   tmsearch.uspto.gov) for anything close that a company owns.
4. Buy it with **auto-renew on** (the default) and WHOIS privacy on (also the default). Turn on
   two-step sign-in for the Cloudflare account if you haven't.

## 2. Put the website on it (you, once, free)

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**, and pick the
   `pxkillah/Flightboard-` repository (it works when the repository is private).
2. Build settings:
   - Production branch: `main`
   - Build command: `node scripts/build-site.js`
   - Build output directory: `dist/site`
   - Environment variable: `NODE_VERSION` = `22`
3. Save and deploy. You get a `*.pages.dev` address; check it.
4. The project → **Custom domains → Set up a custom domain**: add your domain, then again for
   `www.` plus your domain. Cloudflare sets up the DNS and the HTTPS certificate itself,
   and renews the certificate.
5. Tell me the domain, and I'll put it in `site/config.js` (`url`) and in the store listings.

After that, every merge to `main` rebuilds the site within a minute or two, and each pull
request gets its own preview address. To undo a bad change: the project → Deployments →
pick an earlier one → **Rollback to this deployment**.

## 3. The server's address (optional, recommended)

So the server is `https://api.<your domain>` instead of `car-report-api.<you>.workers.dev`:
Workers & Pages → `car-report-api` → Settings → **Domains & Routes → Add → Custom domain**
→ `api.` plus your domain. Then use that address as `REPORT_API` (`docs/server.md`, step 5).

## 4. Email at the domain (optional, free)

Cloudflare → your domain → **Email → Email Routing**: forward `support@` plus your domain to
`creport88@gmail.com`. That gives the stores and buyers an address at your domain while you
keep reading mail in Gmail. Replies still come from Gmail unless you set up "Send mail as" in
Gmail with an outgoing mail service; until then, keep `creport88@gmail.com` as the contact.

## 5. When the apps are live

Put their store links in `site/config.js` (`appStore`, `googlePlay`); the "Coming soon" note
becomes buttons. Apple and Google ask that you use their official badges: download them from
developer.apple.com/app-store/marketing/guidelines and play.google.com/intl/en/badges, and
save them as `site/img/badge-appstore-en.svg`, `badge-appstore-fr.svg`,
`badge-googleplay-en.svg` and `badge-googleplay-fr.svg`; the build uses them when they're there.

## 6. Retire the old GitHub Pages site

Once the new site is live: GitHub → the repository → Settings → Pages → **Unpublish**. The
free VIN tool stops being public (its code stays in the repo: it's also the app). Making the
repository private on the free plan unpublishes it anyway (decision 15).
