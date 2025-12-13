# Storage Model

## Database

- **Engine:** IndexedDB via Dexie.js for structured access.
- **Database name:** `marketpulseai`.
- **Versioning:** Single fixed schema; migrations are not tracked or applied.
- **Retention:** Only the most recent N days of snapshots are kept (default **7**); older records are purged daily before new data is collected.

## Tables

### `topBoxSnapshots`

- **Key:** Composite `[id+dateTime]` with secondary indexes on `id`, `dateTime`, and `status`.
- **Columns:**

| Field                  | Description                                   |
| ---------------------- | --------------------------------------------- |
| `id`                   | Symbol identifier (instrument id).            |
| `dateTime`             | ISO timestamp when the snapshot was captured. |
| `symbolName`           | Full symbol name from header.                 |
| `symbolAbbreviation`   | Ticker abbreviation from header.              |
| `lastTrade`            | Last trade price.                             |
| `closingPrice`         | Closing price.                                |
| `firstPrice`           | First price of the session.                   |
| `tradesCount`          | Count of trades.                              |
| `tradingVolume`        | Volume traded.                                |
| `tradingValue`         | Value traded.                                 |
| `marketValue`          | Market value.                                 |
| `lastPriceTime`        | Latest price info time shown on page.         |
| `status`               | Trading status.                               |
| `dailyLowRange`        | Low end of daily range.                       |
| `dailyHighRange`       | High end of daily range.                      |
| `allowedLowPrice`      | Lower bound of allowed price.                 |
| `allowedHighPrice`     | Upper bound of allowed price.                 |
| `shareCount`           | Number of outstanding shares.                 |
| `baseVolume`           | Base volume.                                  |
| `floatingShares`       | Floating shares percentage.                   |
| `averageMonthlyVolume` | Average volume over past month.               |
| `realBuyVolume`        | Individual investors' buy volume.             |
| `realSellVolume`       | Individual investors' sell volume.            |
| `legalBuyVolume`       | Institutional buy volume.                     |
| `legalSellVolume`      | Institutional sell volume.                    |
| `totalBuyVolume`       | Combined buy volume.                          |
| `totalSellVolume`      | Combined sell volume.                         |
| `realBuyCount`         | Individual buy orders count.                  |
| `realSellCount`        | Individual sell orders count.                 |
| `legalBuyCount`        | Institutional buy orders count.               |
| `legalSellCount`       | Institutional sell orders count.              |
| `totalBuyCount`        | Combined buy orders count.                    |
| `totalSellCount`       | Combined sell orders count.                   |

### `analysisCache`

- **Key:** `symbol`.
- **Columns:**

| Field            | Description                                    |
| ---------------- | ---------------------------------------------- |
| `symbol`         | Symbol identifier tied to stored snapshots.    |
| `lastAnalyzedAt` | ISO timestamp of the most recent analysis run. |

## Migrations

- Not used. The database stays on one schema version, so upgrades rely on fresh installs rather than data migrations.
