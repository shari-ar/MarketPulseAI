# Analysis & Ranking

## TensorFlow.js Workflow

- **Model loading:** TensorFlow.js assets are pulled locally by the analysis worker to avoid network dependencies.
- **Normalization:** Input records are normalized before inference to stabilize probability outputs.
- **Batching:** Worker clients send batched requests to keep the UI responsive during long-running analysis.

## Where the Analysis Runs

- **Worker location:** `/extension/analysis/` holds the TensorFlow.js worker entry point (`index.js`) plus helpers for normalization, ranking, modal progress, and worker messaging.
- **Popup hooks:** The popup triggers analysis through the worker client so scoring stays off the UI thread while progress updates flow back to the modal.

## Trigger Conditions

- **Complete scan:** Run analysis automatically once all stock symbols has been scraped successfully.
- **07:00 cutoff safety net:** If the crawl is incomplete or has errors by the 07:00 hard stop (market-opening rush), force analysis with whatever data is available so the table is ready when trading starts.

## Ranking Logic

- **Score calculation:** Each symbol receives a swing probability that drives table ordering.
- **Result hydration:** The popup merges scores with cached snapshots so users see both model output and supporting metrics.
- **Top-five clarity:** The extension page highlights the five symbols with the highest expected swing, matching the count shown in settings so users know why five appear by default.
- **Progress feedback:** A modal reports progress and completion, preventing duplicate runs while the worker executes.

## Result Persistence & Export

- **Per-snapshot storage:** Each `[id+dateTime]` entry in `topBoxSnapshots` captures the model's next-day swing as `predictedSwingPercent` (for example, `3.5` means a 3.5% swing forecast for the following session).
- **Excel handoff:** After ranking, the popup can export the displayed table (including `predictedSwingPercent`) to Excel for offline review.

## Output Integrity

- **Cached timestamps:** `analysisCache` tracks the last analyzed time to skip unchanged records.
- **Validation:** Invalid or missing fields are rejected before inference to keep rankings trustworthy.

## Diagnostics Playbook

- **Watch the worker logs:** Use DevTools console while running the extension to catch model-loading or malformed-record errors from `analysis/index.js`.
- **Unstick stalled runs:** Clear the `analysisCache` Dexie table (IndexedDB `marketpulseai` database) so freshness checks don’t block new scoring after failures.
- **Verify data freshness:** If post-close analysis shows nothing new, confirm the machine clock matches IRST and re-run the worker to refresh cached timestamps and exports.
