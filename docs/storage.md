# Storage Model

## Database

- **Engine:** IndexedDB via Dexie.js for structured, versioned access.
- **Database name:** `marketpulseai`.
- **Versioning:** Schema versions tracked in `SCHEMA_MIGRATIONS`; the highest version defines the active schema.

## Tables

- **`topBoxSnapshots`:** Primary store keyed by `[id+dateTime]` capturing price, volume, investor, and status fields.
- **`analysisCache`:** Tracks `symbol` and `lastAnalyzedAt` to align snapshots with the most recent TensorFlow.js run.

## Migrations

- Legacy OHLC tables are retired as of migration 3, replaced by top-box snapshots.
- Migration 2 backfills `collectedAt` timestamps for older OHLC records when present.
- New tables are added incrementally to avoid data loss and keep analysis cache synchronized.
