# Storage Model

## Overview

- **Engine:** IndexedDB backed by Dexie.js for structured reads/writes inside the extension.
- **Database name:** `marketpulseai`.
- **Schema version:** Single fixed version; migrations are not tracked. Fresh installs pick up schema changes.
- **Retention:** Only the most recent N days of snapshots are kept (default **7**). Records older than the window are purged daily before new data is saved.
- **Import merge rule:** Excel imports append only records whose composite `[id + dateTime]` key does not already exist in `topBoxSnapshots`; existing rows remain untouched.

## Tables

### `topBoxSnapshots`

- **Primary key:** Compound `[id + dateTime]`.
- **Secondary indexes:** `id`, `dateTime`, `status`.
- **Purpose:** Stores per-symbol market snapshots pulled from the top box scrape.
- **Columns:**

| Field                       | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `id`                        | Symbol identifier (instrument id).                                 |
| `dateTime`                  | ISO timestamp when the snapshot was captured.                      |
| `symbolName`                | Full symbol name from the header.                                  |
| `symbolAbbreviation`        | Ticker abbreviation from the header.                               |
| `predictedSwingPercent`     | Model-predicted swing percentage for tomorrow.                     |
| `predictedSwingProbability` | Calibrated probability (0–1) that the forecasted swing will occur. |
| `close`                     | Last trade price.                                                  |
| `primeCost`                 | Previous closing price.                                            |
| `open`                      | First price of the trading session.                                |
| `tradesCount`               | Number of trades.                                                  |
| `tradingVolume`             | Volume traded.                                                     |
| `tradingValue`              | Value traded.                                                      |
| `marketValue`               | Market capitalization.                                             |
| `closeTime`                 | Timestamp for the latest price shown on page.                      |
| `status`                    | Trading status.                                                    |
| `low`                       | Low end of the daily price range.                                  |
| `high`                      | High end of the daily price range.                                 |
| `allowedLow`                | Lower bound of the allowed price range.                            |
| `allowedHigh`               | Upper bound of the allowed price range.                            |
| `shareCount`                | Outstanding shares.                                                |
| `baseVolume`                | Base volume.                                                       |
| `floatingShares`            | Floating shares percentage.                                        |
| `averageMonthlyVolume`      | Average traded volume over the past month.                         |
| `naturalBuyVolume`          | Individual investors' buy volume.                                  |
| `naturalSellVolume`         | Individual investors' sell volume.                                 |
| `juridicalBuyVolume`        | Institutional buy volume.                                          |
| `juridicalSellVolume`       | Institutional sell volume.                                         |
| `totalBuyVolume`            | Combined buy volume.                                               |
| `totalSellVolume`           | Combined sell volume.                                              |
| `naturalBuyCount`           | Count of individual buy orders.                                    |
| `naturalSellCount`          | Count of individual sell orders.                                   |
| `juridicalBuyCount`         | Count of institutional buy orders.                                 |
| `juridicalSellCount`        | Count of institutional sell orders.                                |
| `totalBuyCount`             | Combined buy orders count.                                         |
| `totalSellCount`            | Combined sell orders count.                                        |

### `analysisCache`

- **Primary key:** `symbol`.
- **Purpose:** Tracks analysis freshness to avoid reprocessing unchanged symbols.
- **Columns:**

| Field            | Description                                    |
| ---------------- | ---------------------------------------------- |
| `symbol`         | Symbol identifier tied to stored snapshots.    |
| `lastAnalyzedAt` | ISO timestamp of the most recent analysis run. |

### `logs`

- **Primary key:** Auto-incremented `id` per entry.
- **Purpose:** Persists structured diagnostics instead of console output, enabling retention policies by severity.
- **Columns:**

| Field       | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `type`      | Log level (e.g., `error`, `warning`, `info`, `debug`).       |
| `message`   | Human-readable text describing the event.                    |
| `context`   | JSON-serializable payload for symbol ids, stack traces, etc. |
| `createdAt` | ISO timestamp of when the entry was recorded.                |
| `expiresAt` | ISO timestamp derived from the per-type retention window.    |
| `source`    | Component emitting the log (e.g., `navigation`, `analysis`). |

## Migrations

- Not used. Schema updates ship through extension updates; stale data is cleared by reinstalling or by the retention sweep.
