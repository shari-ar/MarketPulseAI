# Scheduling & Timing

## Market Close Awareness

- **Collection window:** Scraping starts after 13:00 IRST (UTC+03:30) to ensure post-close data consistency.
- **Unlock logic:** Write operations remain paused until the market is closed, preventing intraday interference.

## Refresh Strategy

- **Staleness-first:** Symbols with the oldest snapshots are refreshed first to smooth out coverage.
- **Retry handling:** Navigation scripts wait for critical selectors and re-queue symbols if pages fail to load completely.

## User Impact

- **Silent operation:** Collection runs in the background without disrupting normal browsing.
- **Manual override:** Users can trigger analysis and exports anytime after data is refreshed.
