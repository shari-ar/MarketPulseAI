# Architecture

## Runtime Model

- **Browser extension surfaces:** Background scripts orchestrate scraping and status events, while the popup renders analysis results and exports.
- **Data boundary:** All scraping, storage, and TensorFlow.js inference stay local to the browser; no remote APIs are used.
- **Scheduling:** Collection is gated until market close (13:00 IRST, UTC+03:30) to avoid intraday disruption.

## Core Components

- **Navigation & scraping:** `navigation/` and `parsing/` coordinate page traversal and DOM extraction for symbol pages.
- **Storage layer:** Dexie-backed IndexedDB schema defined in `storage/schema.js` with migrations to keep snapshots and analysis cache consistent.
- **Analysis workers:** `analysis/` hosts TensorFlow.js scoring, ranking, and progress modal coordination, offloading heavy work to a dedicated worker.
- **UI & exports:** Popup UI renders sorted insights and triggers Excel exports via SheetJS, mirroring the on-screen table.

## Data Flow Summary

1. Detect market close and begin collection.
2. Select symbols with the stalest snapshots.
3. Scrape OHLC/top-box fields, writing snapshots into IndexedDB.
4. Run TensorFlow.js analysis against stored history.
5. Present ranked results and let the user export the current table to Excel.
