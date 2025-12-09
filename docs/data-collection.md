# Data Collection

## Triggers

- **Time gate:** Collection routines start after market close (13:00 IRST) to avoid intraday interference.
- **Staleness-aware ordering:** Symbols with the oldest snapshots are prioritized for refresh to keep history balanced.

## Scraping Approach

- **Navigation helpers:** Background scripts steer the browser through symbol pages, waiting for critical DOM nodes before parsing.
- **Parsing:** DOM selectors capture top-box metrics including prices, volumes, trade counts, and investor breakdowns.
- **Validation:** Inputs are sanitized and normalized before persistence to prevent malformed records from reaching IndexedDB.

## Persistence

- **Dexie.js schema:** Snapshots are stored under the `topBoxSnapshots` table with composite key `[id+dateTime]` for fast lookups.
- **Analysis cache:** A lightweight cache tracks the last analyzed timestamp per symbol to avoid redundant computation.
