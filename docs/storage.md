# Storage Model

## Overview

- **Engine:** IndexedDB backed by Dexie.js for structured reads/writes inside the extension.
- **Database name:** `marketpulseai`.
- **Schema version:** Single fixed version; migrations are not tracked. Fresh installs pick up schema changes.
- **Retention:** Only the most recent N days of snapshots are kept (default **7**). Records older than the window are purged daily before new data is saved.

## Tables

### `topBoxSnapshots`

- **Primary key:** Compound `[id + dateTime]`.
- **Secondary indexes:** `id`, `dateTime`, `status`.
- **Purpose:** Stores per-symbol market snapshots pulled from the top box scrape.
- **Columns:**

| Field                  | Description                                   |
| ---------------------- | --------------------------------------------- |
| `id`                   | Symbol identifier (instrument id).            |
| `dateTime`             | ISO timestamp when the snapshot was captured. |
| `symbolName`           | Full symbol name from the header.             |
| `symbolAbbreviation`   | Ticker abbreviation from the header.          |
| `lastTrade`            | Last trade price.                             |
| `closingPrice`         | Previous closing price.                       |
| `firstPrice`           | First price of the trading session.           |
| `tradesCount`          | Number of trades.                             |
| `tradingVolume`        | Volume traded.                                |
| `tradingValue`         | Value traded.                                 |
| `marketValue`          | Market capitalization.                        |
| `lastPriceTime`        | Timestamp for the latest price shown on page. |
| `status`               | Trading status.                               |
| `dailyLowRange`        | Low end of the daily price range.             |
| `dailyHighRange`       | High end of the daily price range.            |
| `allowedLowPrice`      | Lower bound of the allowed price range.       |
| `allowedHighPrice`     | Upper bound of the allowed price range.       |
| `shareCount`           | Outstanding shares.                           |
| `baseVolume`           | Base volume.                                  |
| `floatingShares`       | Floating shares percentage.                   |
| `averageMonthlyVolume` | Average traded volume over the past month.    |
| `realBuyVolume`        | Individual investors' buy volume.             |
| `realSellVolume`       | Individual investors' sell volume.            |
| `legalBuyVolume`       | Institutional buy volume.                     |
| `legalSellVolume`      | Institutional sell volume.                    |
| `totalBuyVolume`       | Combined buy volume.                          |
| `totalSellVolume`      | Combined sell volume.                         |
| `realBuyCount`         | Count of individual buy orders.               |
| `realSellCount`        | Count of individual sell orders.              |
| `legalBuyCount`        | Count of institutional buy orders.            |
| `legalSellCount`       | Count of institutional sell orders.           |
| `totalBuyCount`        | Combined buy orders count.                    |
| `totalSellCount`       | Combined sell orders count.                   |

### `analysisCache`

- **Primary key:** `symbol`.
- **Purpose:** Tracks analysis freshness to avoid reprocessing unchanged symbols.
- **Columns:**

| Field            | Description                                    |
| ---------------- | ---------------------------------------------- |
| `symbol`         | Symbol identifier tied to stored snapshots.    |
| `lastAnalyzedAt` | ISO timestamp of the most recent analysis run. |

## Migrations

- Not used. Schema updates ship through extension updates; stale data is cleared by reinstalling or by the retention sweep.
