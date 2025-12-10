# Architecture

## Runtime Model

- **Browser extension surfaces:** Background scripts orchestrate scraping and status events, while the popup renders analysis results and exports.
- **Data boundary:** All scraping, storage, and TensorFlow.js inference stay local to the browser; no remote APIs are used.
- **Scheduling:** Collection is gated until market close (13:00 IRST, UTC+03:30) to avoid intraday disruption.
- **Daily loop:** The cycle runs from 13:00–07:00, pruning stale data at 13:00, scraping within the window, and forcing analysis at 07:00 even if crawling was partial.
- **Offline-first bundle:** TensorFlow.js and SheetJS ship with the extension, and the manifest only requests the permissions needed for navigation and storage.

## Core Components

- **Navigation & scraping:** `navigation/` and `parsing/` coordinate page traversal and DOM extraction for symbol pages.
- **Storage layer:** Dexie-backed IndexedDB schema defined in `storage/schema.js` that stays on a single fixed version (no migrations); consistency comes from fresh installs and daily retention pruning.
- **Analysis workers:** `analysis/` hosts TensorFlow.js scoring, ranking, and progress modal coordination, offloading heavy work to a dedicated worker.
- **UI & exports:** Popup UI renders sorted insights and triggers Excel exports via SheetJS, mirroring the on-screen table.
- **Entry points:** `manifest.json` wires background and popup scripts, `navigator.js` drives page movement, `analysis/index.js` orchestrates worker scoring, and `popup.*` renders rankings/exports.

## Storage & Configuration

- **Database contract:** IndexedDB via Dexie named `marketpulseai` with tables `topBoxSnapshots` (`[id+dateTime]` composite key) and `analysisCache` (`symbol`, `lastAnalyzedAt`).
- **Versioning:** Single fixed schema; upgrades rely on reinstalling rather than migrations.
- **Retention policy:** Keep the last 7 days by default, purging older rows at the start of each daily window.
- **Defaults surfaced in settings:** Market close at 13:00 IRST, retention days (7), and a top-5 swing list size all appear as editable defaults.

## Data Collection Flow

1. **Prune & gate:** At 13:00 IRST, delete snapshots older than the retention window, then allow crawling only inside the 13:00–07:00 window.
2. **Select targets:** Choose symbols with the stalest snapshots; each is scraped once per 24-hour cycle.
3. **Navigate & parse:** Background helpers move through symbol pages, waiting for required selectors before extracting top-box metrics and validating inputs.
4. **Persist:** Write sanitized records into `topBoxSnapshots` and update `analysisCache` timestamps when analysis completes.
5. **Retry & cutoff:** Failed pages are re-queued; if crawling is still incomplete at 07:00, stop collection and proceed to analysis with available data.

## Data Flow Summary

1. Detect market close and begin collection.
2. Select symbols with the stalest snapshots.
3. Scrape OHLC/top-box fields, writing snapshots into IndexedDB.
4. Run TensorFlow.js analysis against stored history.
5. Present ranked results and let the user export the current table to Excel.

## Analysis & Ranking

- **Local workflow:** Analysis worker loads TensorFlow.js assets locally, normalizes inputs, and batches inference requests to stay responsive.
- **Trigger rules:** Run automatically after a successful full crawl or force-run at the 07:00 cutoff with partial data so the table is ready by market open.
- **Ranking & hydration:** Scores drive ordering; popup hydrates results with cached snapshots and highlights the top 5 symbols by default.
- **Progress & integrity:** A modal blocks duplicate runs while reporting status; invalid/missing fields are rejected and `analysisCache` timestamps prevent redundant computation.

## Diagnostics

- **Logging hooks:** Worker logs surface model loading issues or malformed records; clearing `analysisCache` can unblock stalled runs.
- **Data freshness checks:** If no data appears after close, verify system time matches IRST and that symbol pages are reachable; exports rely on the latest analyzed table to match downloads.
