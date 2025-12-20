# Scheduling & Timing

## Market Close Awareness

- **Trading calendar:** The market runs Saturday through Wednesday from 09:00–13:00 IRST (UTC+03:30). The extension schedules work from the 13:00 close through the 07:00 buffer before the next open.
- **Weekend bridge:** After Wednesday’s close, the work window stays open until 07:00 on Saturday to give analysis time across the Thursday–Friday break.
- **Configurable close:** The market-close time is pulled from user settings rather than hardcoded at 13:00, so schedules adapt automatically to custom trading hours.
- **Open-market blackout:** During market-open hours (default 09:00–13:00 IRST, Saturday–Wednesday), the extension enters a read-only state with navigation, scraping, storage, and analysis paused until the close event unlocks work.
- **Safe window:** Writes occur only outside the blackout window to prevent intraday interference, and the blackout is configurable through the same settings that expose close time.
- **Daily purge:** The cycle begins with pruning data older than the configured retention window (default seven days) before any new writes occur. The same 13:00 kickoff also deletes expired logs by type (e.g., errors after 30 days, warnings after 7, info after 3) using the intervals configured in settings.

## Refresh Strategy

- **Daily cadence:** Each stock symbol is scraped and saved exactly once per 24-hour cycle within the 13:00–07:00 window, stopping at the 07:00 cutoff even if a crawl began late.
- **Retry handling:** Navigation scripts wait for critical selectors and re-queue symbols if pages fail to load completely.
- **Analysis deadline:** If a full crawl finishes, analysis runs immediately; otherwise, analysis is forced exactly at the 07:00 cutoff even with partial data so the pre-market view is ready.

## User Impact

- **Silent operation:** Collection runs in the background without disrupting normal browsing.
- **Analysis cadence:** Analysis only runs automatically after a full crawl or at 07:00 if crawling is incomplete; exports remain manual.
- **Tab lifecycle:** Automation is scoped to `https://tsetmc.com/*` (and subdomains); leaving the site, closing the tab, or switching away halts work immediately and the next visit restarts the full pruning → scrape → forecast sequence.
