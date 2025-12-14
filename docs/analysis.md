# Analysis & Ranking

## TensorFlow.js Workflow

- **Model loading:** TensorFlow.js assets are pulled locally by the analysis worker to avoid network dependencies.
- **Normalization:** Input records are normalized before inference to stabilize probability outputs.
- **Batching:** Worker clients send batched requests to keep the UI responsive during long-running analysis.

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
