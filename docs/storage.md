# Storage Model

## Database

- **Engine:** IndexedDB via Dexie.js for structured access.
- **Database name:** `marketpulseai`.
- **Versioning:** Single fixed schema; migrations are not tracked or applied.

## Tables

- **`topBoxSnapshots`:** Primary store keyed by `[id+dateTime]` capturing price, volume, investor, and status fields.
- **`analysisCache`:** Tracks `symbol` and `lastAnalyzedAt` to align snapshots with the most recent TensorFlow.js run.

## Migrations

- Not used. The database stays on one schema version, so upgrades rely on fresh installs rather than data migrations.
