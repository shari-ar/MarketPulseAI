# Data Collection

## Triggers

- **Time gate:** Collection routines start after market close (13:00 IRST) and run only until the 07:00 deadline the next day, staying within a single daily window and stopping even if a crawl was still in-flight.
- **Pre-flight cleanup:** At the start of each day (13:00 IRST), records older than the retention window are pruned before scraping begins.
- **Daily guarantee:** Each symbol is scraped and persisted once per 24 hours; re-reads are suppressed until the next cycle.

## Scraping Approach

- **Navigation helpers:** Background scripts steer the browser through symbol pages, waiting for critical DOM nodes before parsing.
- **Parsing:** DOM selectors capture top-box metrics including prices, volumes, trade counts, and investor breakdowns.
- **Validation:** Inputs are sanitized and normalized before persistence to prevent malformed records from reaching IndexedDB.

## Persistence

- **Dexie.js schema:** Snapshots are stored under the `topBoxSnapshots` table with composite key `[id+dateTime]` for fast lookups.
- **Analysis cache:** A lightweight cache tracks the last analyzed timestamp per symbol to avoid redundant computation.
