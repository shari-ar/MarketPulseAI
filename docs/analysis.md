# Analysis & Ranking Overview

This document describes how MarketPulse AI executes model-driven analysis in the browser extension and how results are stored, ranked, and exported/imported.

## TensorFlow.js Workflow

- **Model assets:** The analysis worker loads TensorFlow.js assets from local extension storage to avoid external network calls.
- **Feature window:** Each forecast consumes the last seven trading days per symbol, rebuilt from `topBoxSnapshots` (sorted by `dateTime`) before scoring.
- **Target definition:** The model outputs the next-day swing percent `(tomorrowHigh - todayPrimeCost) * 100 / todayPrimeCost` as `predictedSwingPercent` **and** a calibrated swing probability as `predictedSwingProbability`.
- **Input preparation:** Incoming stock records are normalized using stored scalers to stabilize regression outputs.
- **Request batching:** Worker clients send batched inference requests so the popup remains responsive during longer runs.

## Trigger Conditions

- **Full crawl completion:** Analysis runs automatically after all stock symbols finish scraping successfully.
- **07:00 safety cutoff:** If scraping is unfinished or errored by 07:00 (market-open rush), analysis proceeds with available data so results are ready for users.

## Ranking Logic

- **Score computation:** Sort by `predictedSwingProbability` in descending order, using `predictedSwingPercent` (descending) as the deterministic tie-breaker; the swing probability drives confidence while the percent conveys move size.
- **Result enrichment:** The popup combines scores with cached snapshots so users see both model output and supporting metrics.
- **Top-five emphasis:** The extension page highlights the five symbols with the highest expected swing, matching the default settings count.
- **Progress reporting:** A modal tracks analysis progress and completion, preventing duplicate runs while the worker executes.

## Result Persistence and Export

- **Snapshot storage:** Each `[id + dateTime]` entry in `topBoxSnapshots` stores both the model's next-day swing percent (`predictedSwingPercent`, e.g., `3.5` for a +3.5% move) and the associated swing probability (`predictedSwingProbability`, e.g., `0.62` for a 62% likelihood of the move materializing).
- **Excel export/import:** After ranking, the popup can export the database main table—including `predictedSwingPercent` **and** `predictedSwingProbability`—to Excel for offline review, and it can import the same schema to add only missing records back into IndexedDB.

## Output Integrity

- **Cache timestamps:** `analysisCache` records the last analysis time to skip unchanged records.
- **Input validation:** Invalid or incomplete fields are rejected before inference to keep rankings trustworthy.

## Forecasting Details

See [Swing Forecasting Methodology](forecasting.md) for the full feature list, model choice (TCN), training regimen, and the `(tomorrowHigh - todayPrimeCost) * 100 / todayPrimeCost` target used by the analysis worker.

## Diagnostics

- **Monitor worker logs:** Use the DevTools console during extension runs to capture model-loading issues or malformed-record errors from `analysis/index.js`.
- **Recover stalled runs:** Clear the `analysisCache` table (IndexedDB `marketpulseai` database) if freshness checks prevent new scoring after failures.
- **Validate data freshness:** If post-close analysis shows no updates, confirm the machine clock matches IRST and rerun the worker to refresh cached timestamps and exports/imports.
