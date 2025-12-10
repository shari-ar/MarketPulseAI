# Scheduling & Timing

## Market Close Awareness

- **Collection window:** Scraping starts after 13:00 IRST (UTC+03:30) to ensure post-close data consistency.
- **Unlock logic:** Write operations remain paused until the market is closed, preventing intraday interference.

## Refresh Strategy

- **Staleness-first:** Symbols with the oldest snapshots are refreshed first to smooth out coverage.
- **Retry handling:** Navigation scripts wait for critical selectors and re-queue symbols if pages fail to load completely.
- **Analysis deadline:** If a full crawl finishes, analysis runs immediately; otherwise, analysis is forced at 07:00 even with partial data so the pre-market view is ready.

## User Impact

- **Silent operation:** Collection runs in the background without disrupting normal browsing.
- **Analysis cadence:** Analysis only runs automatically after a full crawl or at 07:00 if crawling is incomplete; exports remain manual.
