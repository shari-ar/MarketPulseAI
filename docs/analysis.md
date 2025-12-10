# Analysis & Ranking

## TensorFlow.js Workflow

- **Model loading:** TensorFlow.js assets are pulled locally by the analysis worker to avoid network dependencies.
- **Normalization:** Input records are normalized before inference to stabilize probability outputs.
- **Batching:** Worker clients send batched requests to keep the UI responsive during long-running analysis.

## Trigger Conditions

- **Complete scan:** Run analysis automatically once all stock symbols has been scraped successfully.
- **7:00 pre-open safety net:** If the crawl is incomplete or has errors by 07:00 (market-opening rush), force analysis with whatever data is available so the table is ready when trading starts.

## Ranking Logic

- **Score calculation:** Each symbol receives a swing probability that drives table ordering.
- **Result hydration:** The popup merges scores with cached snapshots so users see both model output and supporting metrics.
- **Progress feedback:** A modal reports progress and completion, preventing duplicate runs while the worker executes.

## Output Integrity

- **Cached timestamps:** `analysisCache` tracks the last analyzed time to skip unchanged records.
- **Validation:** Invalid or missing fields are rejected before inference to keep rankings trustworthy.
