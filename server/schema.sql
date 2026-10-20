-- Car Report server database (Cloudflare D1, SQLite). Apply with:
--   npx wrangler d1 execute car-report --remote --file=schema.sql

-- Each purchase unlocks one VIN. txn is 'ios:<transaction id>' or 'android:<SHA-256 of the
-- purchase token>'; the raw token is never stored. fetches counts listing history requests
-- for the purchase on `day` (UTC), to cap how often one purchase can ask MarketCheck again.
CREATE TABLE IF NOT EXISTS unlocks (
  txn TEXT PRIMARY KEY,
  vin TEXT NOT NULL,
  platform TEXT NOT NULL,
  created INTEGER NOT NULL,
  day TEXT NOT NULL DEFAULT '',
  fetches INTEGER NOT NULL DEFAULT 0
);

-- Daily request counters for the free listing count: per caller (k = 'ip:' and a keyed hash
-- of the IP address, never the address itself) and overall (k = 'all'). Deleted after 2 days.
CREATE TABLE IF NOT EXISTS counters (
  k TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (k, day)
);

-- The free listing count per VIN, reused for a day so repeat checks cost nothing.
CREATE TABLE IF NOT EXISTS previews (
  vin TEXT PRIMARY KEY,
  listings INTEGER NOT NULL,
  more INTEGER NOT NULL,
  at INTEGER NOT NULL
);
