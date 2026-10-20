# The Car Report server

`server/` is a small Cloudflare Worker that sells nothing itself: it checks App Store and
Google Play purchases with Apple and Google, and fetches the listing history from MarketCheck
with the owner's key (decision 16). It holds every secret the paid report needs, so the app
never contains one. Do these steps on your own computer, in a Terminal window. **Never paste a
key or password into a chat, an issue, or a file in this repository.**

## What it costs

- Cloudflare Workers and D1: free plan (100,000 requests a day). A report is 2 to 3 requests.
- MarketCheck: about US$0.006 a call. A free listing count is 1 call (reused for a day per
  VIN, at most 500 new counts a day in total); a bought report is 1 to 4 calls.

## Set it up (once)

1. Create a free Cloudflare account at dash.cloudflare.com and turn on two-step sign-in.
   Workers & Pages → pick your `workers.dev` subdomain (for example `pxkillah`).
2. In a Terminal window:

   ```
   cd Flightboard-/server
   npx wrangler login                       # opens the browser to allow it
   npx wrangler d1 create car-report        # prints a database_id
   ```

   Put that `database_id` in `server/wrangler.toml` in place of `REPLACE_WITH_DATABASE_ID`,
   then create the tables:

   ```
   npx wrangler d1 execute car-report --remote --file=schema.sql
   ```

3. Add the secrets. Each command asks you to paste the value, and it isn't shown or saved
   anywhere on your computer:

   | Secret | Where it comes from |
   |---|---|
   | `MARKETCHECK_API_KEY` | Your MarketCheck dashboard. Use a key for this server only, so you can cancel it without affecting anything else. |
   | `APPLE_ISSUER_ID` | App Store Connect → Users and Access → Integrations → In-App Purchase. Shown above the keys. |
   | `APPLE_KEY_ID` | Same page: Generate an In-App Purchase key; its Key ID. |
   | `APPLE_PRIVATE_KEY` | The `.p8` file you download once when you generate that key. Paste its whole contents, including the BEGIN and END lines. Keep the file in your password manager, then delete it from Downloads. |
   | `GOOGLE_SERVICE_ACCOUNT` | Google Cloud console → a service account for Play → Keys → Add key → JSON. Then in Play Console → Users and permissions, invite the service account's email with "View financial data" and "Manage orders and subscriptions". Paste the whole JSON file. |

   ```
   npx wrangler secret put MARKETCHECK_API_KEY
   npx wrangler secret put APPLE_ISSUER_ID
   npx wrangler secret put APPLE_KEY_ID
   npx wrangler secret put APPLE_PRIVATE_KEY
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
   ```

4. Deploy, and check it answers:

   ```
   npx wrangler deploy                      # prints https://car-report-api.<subdomain>.workers.dev
   curl https://car-report-api.<subdomain>.workers.dev/v1/health
   ```

5. Tell the app where it is: in `src/paid.js` set `REPORT_API` to that address (no trailing
   slash), and add the same address to `connect-src` in the Content-Security-Policy at the top
   of `index.html`. `npm test` and `npm run check-release` (in `mobile/`) check both. Do this on
   a branch with a pull request, like any other change.

Until `REPORT_API` is set, the app shows every report free, exactly as the website does, and
`check-release` refuses to build a release.

## Settings

The non-secret settings are in `server/wrangler.toml` under `[vars]`: the product ID
(`car_report_full`, the same in App Store Connect, Play Console and `src/paid.js`), the app's
bundle ID and package name, whether sandbox purchases count (`ALLOW_SANDBOX`, needed for
TestFlight and App Review), and the daily limits. Change one and run `npx wrangler deploy`.

## Updating it

After a change to `server/` or to `src/` files it uses (`src/sources/marketcheck.js`,
`src/http.js`, `src/vin.js`) is merged, run `npx wrangler deploy` from `server/`. The app keeps
working during the switch; Cloudflare swaps versions instantly. To roll back:
`npx wrangler rollback`.

## Logs and problems

Cloudflare dashboard → Workers & Pages → car-report-api → Logs. The server logs problems by
name (for example "MarketCheck refused the key" or "missing settings: APPLE_KEY_ID"), never
keys, tokens or VINs. What to do about each is in `docs/runbook.md`.
