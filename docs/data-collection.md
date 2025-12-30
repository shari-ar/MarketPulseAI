# Data Collection

## Triggers

- **Time gate:** Collection routines stay completely idle during market-open hours (09:00–13:00 IRST, Saturday–Wednesday) while navigation, scraping, writes, and analysis remain paused, then start after market close (13:00 IRST) and run until the 07:00 deadline before the next open; after the Wednesday close the same window extends through Thursday and Friday and ends at 07:00 on Saturday.
- **Pre-flight cleanup:** At the start of each day (13:00 IRST), records older than the retention window are pruned before scraping begins.
- **Daily guarantee:** Each symbol is scraped and persisted once per 24 hours; re-reads are suppressed until the next cycle.
- **Tab-aware activation:** The background worker wakes only while a tab is on `https://tsetmc.com/*`, starts pruning, collection, and forecasting immediately on entry, and tears down the run as soon as the user navigates away, switches tabs, or closes the page—fresh work spins up again on the next visit.

## Scraping Approach

- **Navigation helpers:** Background scripts steer the browser through symbol pages, waiting for critical DOM nodes before parsing.
- **Retry pacing:** Failed navigations are retried up to 10 times with a 1-second delay between attempts to reduce transient errors.
- **Parsing:** DOM selectors capture top-box metrics including prices, volumes, trade counts, and investor breakdowns.
- **Validation:** Inputs are sanitized and normalized before persistence to prevent malformed records from reaching IndexedDB.

## Persistence

- **Dexie.js schema:** Snapshots are stored under the `stocks` table with composite key `[id+dateTime]` for fast lookups.
- **Analysis cache:** A lightweight cache tracks the last analyzed timestamp per symbol to avoid redundant computation.
