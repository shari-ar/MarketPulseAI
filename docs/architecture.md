# Architecture

## Runtime Overview

- **Extension surfaces:** Background scripts handle orchestration, scraping, and event signaling; the popup renders analysis results and exports.
- **Local boundary:** Scraping, storage, and TensorFlow.js inference run entirely in the browser with no remote APIs.
- **Schedule:** Data collection runs after market close at 13:00 IRST (UTC+03:30) and pauses by 07:00, while a strict blackout keeps all automation idle during market-open hours (09:00–13:00 IRST).
- **Daily cadence:** At 13:00 pruning removes stale data; scraping runs within the collection window, and analysis is forced at 07:00 if crawling did not fully complete.
- **Offline bundle:** TensorFlow.js and SheetJS ship with the extension, and the manifest requests only navigation and storage permissions.

## Core Components

- **Navigation and scraping:** `navigation/` and `parsing/` coordinate page traversal and DOM extraction for symbol pages.
- **Storage:** Dexie-backed IndexedDB schema in `storage/schema.js` remains on a single version; consistency relies on clean installs and daily pruning.
- **Analysis workers:** `analysis/` handles TensorFlow.js scoring, ranking, and progress modal updates in a dedicated worker.
- **Model assets:** A seven-day Temporal Convolutional Network (TCN) model, converted to TensorFlow.js, forecasts `(tomorrowHigh - todayPrimeCost) * 100 / todayPrimeCost` and the accompanying swing probability for each symbol.
- **UI and exports:** The popup renders ordered insights and triggers Excel exports through SheetJS, mirroring the visible table.
- **Entry points:** `manifest.json` wires background and popup scripts; `navigator.js` drives page movement; `analysis/index.js` orchestrates worker scoring; `popup.*` renders rankings and exports.

## Storage and Configuration

- **Database contract:** IndexedDB via Dexie named `marketpulseai` with tables `topBoxSnapshots` (composite key `[id+dateTime]`) and `analysisCache` (`symbol`, `lastAnalyzedAt`).
- **Versioning:** Fixed schema with reinstall-based upgrades instead of migrations.
- **Retention:** Keep seven days of history by default; older rows are purged when the daily window opens.
- **User defaults:** Settings expose market close (13:00 IRST), market-open blackout window (09:00–13:00 IRST), retention days (7), and top-5 swing list size as editable defaults.

## Data Collection Flow

1. **Prune and gate:** Enforce a full blackout from 09:00–13:00 IRST with no navigation, writes, or analysis; at 13:00 IRST delete snapshots older than the retention window and allow crawling only within 13:00–07:00.
2. **Select targets:** Queue symbols missing a snapshot for the current market date so each one is captured once per day.
3. **Navigate and parse:** Background helpers move through symbol pages, wait for required selectors, extract top-box metrics, and validate inputs.
4. **Persist:** Write sanitized records to `topBoxSnapshots` and update `analysisCache` when analysis completes.
5. **Retry and cutoff:** Re-queue failed pages; if crawling remains incomplete at 07:00, stop collection and proceed to analysis with available data.

## Data Flow Summary

1. Detect market close and begin collection.
2. Enqueue any symbols missing a snapshot for the current market date.
3. Scrape OHLC/top-box fields into IndexedDB.
4. Run TensorFlow.js analysis against stored history.
5. Present ranked results and export the current table to Excel.

## Analysis and Ranking

- **Local execution:** Analysis worker loads TensorFlow.js assets locally, normalizes inputs, and batches inference to stay responsive.
- **Triggers:** Run after a successful full crawl or at the 07:00 cutoff with partial data so the table is ready by market open.
- **Ranking and hydration:** Scores determine ordering; the popup hydrates rows from cached snapshots and highlights the top five symbols by default. Ordering uses `predictedSwingProbability`, with `predictedSwingPercent` shown alongside to indicate expected move size.
- **Progress and integrity:** A modal blocks duplicate runs and reports status; invalid or missing fields are rejected, and `analysisCache` timestamps prevent redundant computation.

## Diagnostics

- **Logging:** Worker logs surface model-loading or record-format issues; clearing `analysisCache` can unblock stalled runs.
- **Freshness checks:** If no data appears after close, verify system time matches IRST and symbol pages are reachable; exports mirror the latest analyzed table.
