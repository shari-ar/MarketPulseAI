# Analysis & Ranking Overview

This document describes how MarketPulse AI executes model-driven analysis in the browser extension and how results are stored, ranked, and exported.

## TensorFlow.js Workflow

- **Model assets:** The analysis worker loads TensorFlow.js assets from local extension storage to avoid external network calls.
- **Input preparation:** Incoming stock records are normalized before inference to stabilize probability outputs.
- **Request batching:** Worker clients send batched inference requests so the popup remains responsive during longer runs.

## Trigger Conditions

- **Full crawl completion:** Analysis runs automatically after all stock symbols finish scraping successfully.
- **07:00 safety cutoff:** If scraping is unfinished or errored by 07:00 (market-open rush), analysis proceeds with available data so results are ready for users.

## Ranking Logic

- **Score computation:** Each symbol receives a swing probability that determines table ordering.
- **Result enrichment:** The popup combines scores with cached snapshots so users see both model output and supporting metrics.
- **Top-five emphasis:** The extension page highlights the five symbols with the highest expected swing, matching the default settings count.
- **Progress reporting:** A modal tracks analysis progress and completion, preventing duplicate runs while the worker executes.

## Result Persistence and Export

- **Snapshot storage:** Each `[id + dateTime]` entry in `topBoxSnapshots` stores the model's next-day swing as `predictedSwingPercent` (for example, `3.5` equals a forecasted 3.5% swing for the next session).
- **Excel export:** After ranking, the popup can export the displayed table—including `predictedSwingPercent`—to Excel for offline review.

## Output Integrity

- **Cache timestamps:** `analysisCache` records the last analysis time to skip unchanged records.
- **Input validation:** Invalid or incomplete fields are rejected before inference to keep rankings trustworthy.

## Diagnostics

- **Monitor worker logs:** Use the DevTools console during extension runs to capture model-loading issues or malformed-record errors from `analysis/index.js`.
- **Recover stalled runs:** Clear the `analysisCache` table (IndexedDB `marketpulseai` database) if freshness checks prevent new scoring after failures.
- **Validate data freshness:** If post-close analysis shows no updates, confirm the machine clock matches IRST and rerun the worker to refresh cached timestamps and exports.
