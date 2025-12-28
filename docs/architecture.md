# Architecture

## Runtime Overview

- **Extension surfaces:** Background scripts handle orchestration, scraping, and event signaling; the popup renders analysis results and handles exports/imports.
- **Local boundary:** Scraping, storage, and TensorFlow.js inference run entirely in the browser with no remote APIs.
- **Activation & schedule:** The background service worker spins up only while the user is on `https://tsetmc.com/*`, triggering pruning, collection, and forecasting on entry; it pauses as soon as the user leaves the site or switches tabs. Work is further gated by time—data collection starts when the blackout ends at the configured market-close time (default 13:00 IRST, UTC+03:30) and pauses by 07:00 before the next 09:00 open on Saturday–Wednesday, with a longer Wednesday-through-Saturday window that bridges the weekend.
- **Daily cadence:** At the configured close, pruning removes stale data and clears expired logs by type before scheduling kicks off; scraping runs within the collection window, and analysis is forced at 07:00 if crawling did not fully complete.
- **Offline bundle:** TensorFlow.js and SheetJS ship with the extension, and the manifest requests only navigation and storage permissions.

## Core Components

- **Navigation and scraping:** `navigation/` and `parsing/` coordinate page traversal and DOM extraction for symbol pages.
- **Storage:** Dexie-backed IndexedDB schema in `storage/schema.js` remains on a single version; consistency relies on clean installs and daily pruning.
- **Analysis workers:** `analysis/` handles TensorFlow.js scoring, ranking, and progress modal updates in a dedicated worker.
- **Model assets:** A seven-day Temporal Convolutional Network (TCN) model, converted to TensorFlow.js, forecasts `(tomorrowHigh - todayPrimeCost) * 100 / todayPrimeCost` and the accompanying swing probability for each symbol. The model uses residual Conv1D stacks (filters 32 → 64, kernel 3, dilations 1 and 2) feeding dual heads: regression (swing percent) and sigmoid classification (swing probability) via a shared dense layer.
- **UI, exports, and imports:** The popup renders ordered insights and triggers Excel exports/imports through SheetJS, mirroring the visible table and reading the same schema back into IndexedDB.
- **Entry points:** `manifest.json` wires background and popup scripts; `navigator.js` drives page movement; `analysis/index.js` orchestrates worker scoring; `popup.*` renders rankings and exports.
- **Extension layout:** `extension/background/` hosts navigation, parsing, and scheduling; `extension/analysis/` contains the worker, TF.js assets, scalers, and calibration metadata; `extension/popup/` renders rankings and controls; `extension/navigation/` houses site-specific travel helpers. `manifest.json` registers background, worker, and popup bundles.

## Model Training and Inference

- **Training pipeline:** Build seven-day sliding windows from `topBoxSnapshots`, compute engineered ratios and returns, Z-score using training-set statistics, and train the TCN with Huber loss and Adam (cosine decay, early stopping). Calibrate the probability head with Platt scaling; clip forecasts to [-50%, 50%] (percent) and [0.01, 0.99] (probability) before display.
- **Inference workflow:** Require seven recent snapshots, rebuild engineered features with stored scalers, and batch TF.js scoring inside the analysis worker. Apply saved calibration parameters, persist full-precision scores to the latest snapshot, and round for UI/export rendering. If assets fail to load, skip inference and keep scores null.
- **Ranking rules:** Symbols sort by `predictedSwingProbability`; `predictedSwingPercent` appears alongside for magnitude context, with the top five highlighted by default.
- **Artifact versioning:** Bundle TF.js model JSON/weights, scalers, and calibration params under `analysis/models/` as `swing-tcn-<yyyy-mm-dd>-v<N>`. Keep the latest two versions for rollback and point the active manifest entry to the chosen tag.

## Storage and Configuration

- **Database contract:** IndexedDB via Dexie named `marketpulseai` with tables `topBoxSnapshots` (composite key `[id+dateTime]`), `analysisCache` (`symbol`, `lastAnalyzedAt`), and `logs` (auto-increment `id`, per-type retention windows).
- **Versioning:** Fixed schema with reinstall-based upgrades instead of migrations.
- **Retention:** Keep seven days of history by default; older rows are purged when the daily window opens.
- **User defaults:** Settings expose editable defaults for the market-open blackout window (09:00–13:00 IRST on Saturday–Wednesday), retention days (7), top swing list size (5), etc.

## Data Collection Flow

1. **Prune and gate:** Enforce a blackout during the configured open hours (default 09:00–13:00 IRST, Saturday–Wednesday) with navigation, writes, and analysis paused; at market close delete snapshots older than the retention window, trim expired logs, and allow crawling only within the close-to-07:00 window that bridges from Wednesday into Saturday across the weekend.
2. **Select targets:** Queue symbols missing a snapshot for the current market date so each one is captured once per day.
3. **Navigate and parse:** Background helpers move through symbol pages, wait for required selectors, extract top-box metrics, and validate inputs.
4. **Persist:** Write sanitized records to `topBoxSnapshots` and update `analysisCache` when analysis completes.
5. **Retry and cutoff:** Re-queue failed pages; if crawling remains incomplete at 07:00, stop collection and proceed to analysis with available data.

## Data Flow Summary

1. Detect market close and begin collection.
2. Enqueue any symbols missing a snapshot for the current market date.
3. Scrape OHLC/top-box fields into IndexedDB.
4. Run TensorFlow.js analysis against stored history.
5. Present ranked results and offer side-by-side Export and Import controls for Excel round-tripping.

## Analysis and Ranking

- **Local execution:** Analysis worker loads TensorFlow.js assets locally, normalizes inputs, and batches inference to stay responsive.
- **Triggers:** Run after a successful full crawl or at the 07:00 cutoff with partial data so the table is ready by market open.
- **Ranking and hydration:** Scores determine ordering; the popup hydrates rows from cached snapshots and highlights the top five symbols by default. Ordering uses `predictedSwingProbability`, with `predictedSwingPercent` shown alongside to indicate expected move size.
- **Progress and integrity:** A modal blocks duplicate runs and reports status; invalid or missing fields are rejected, and `analysisCache` timestamps prevent redundant computation.

## Diagnostics

- **Logging:** Logs write to IndexedDB with per-type retention; worker entries capture model-loading or record-format issues, and the daily cleanup at the configured close trims log tables according to their configured windows.
- **Freshness checks:** If no data appears after close, verify system time matches IRST and symbol pages are reachable; exports mirror the latest analyzed table and imports append only missing rows.
