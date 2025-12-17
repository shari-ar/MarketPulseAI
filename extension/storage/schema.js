export const DB_NAME = "marketpulseai";
export const SNAPSHOT_TABLE = "topBoxSnapshots";
export const ANALYSIS_CACHE_TABLE = "analysisCache";

export const SNAPSHOT_FIELDS = {
  id: "Symbol identifier (instrument id)",
  dateTime: "ISO timestamp when the snapshot was captured",
  symbolName: "Full symbol name from header",
  symbolAbbreviation: "Ticker abbreviation from header",
  predictedSwingPercent: "Number: model-predicted swing percentage for the next session",
  predictedSwingProbability: "Number: probability the predicted swing materializes",
  close: "Number: last trade price",
  primeCost: "Number: closing price",
  open: "Number: first price of the session",
  tradesCount: "Number: count of trades",
  tradingVolume: "Number: volume traded",
  tradingValue: "Number: value traded",
  marketValue: "Number: market value",
  closeTime: "String: latest price info time shown on page",
  status: "String: trading status",
  low: "Number: low end of daily range",
  high: "Number: high end of daily range",
  allowedLow: "Number: lower bound of allowed price",
  allowedHigh: "Number: upper bound of allowed price",
  shareCount: "Number of outstanding shares",
  baseVolume: "Number: base volume",
  floatingShares: "Number: floating shares percentage",
  averageMonthlyVolume: "Number: average volume over past month",
  naturalBuyVolume: "Number: individual investors' buy volume",
  naturalSellVolume: "Number: individual investors' sell volume",
  juridicalBuyVolume: "Number: institutional buy volume",
  juridicalSellVolume: "Number: institutional sell volume",
  totalBuyVolume: "Number: combined buy volume",
  totalSellVolume: "Number: combined sell volume",
  naturalBuyCount: "Number: individual buy orders count",
  naturalSellCount: "Number: individual sell orders count",
  juridicalBuyCount: "Number: institutional buy orders count",
  juridicalSellCount: "Number: institutional sell orders count",
  totalBuyCount: "Number: combined buy orders count",
  totalSellCount: "Number: combined sell orders count",
};

export const ANALYSIS_CACHE_FIELDS = {
  symbol: "Symbol identifier tied to stored snapshots",
  lastAnalyzedAt: "ISO timestamp of the most recent analysis run",
};

const LEGACY_OHLC_TABLE = "ohlcRecords";

export const SCHEMA_MIGRATIONS = {
  1: {
    stores: {
      [LEGACY_OHLC_TABLE]: "++id, symbol, tradeDate, [symbol+tradeDate]",
    },
  },
  2: {
    stores: {
      [LEGACY_OHLC_TABLE]: "++id, symbol, tradeDate, [symbol+tradeDate], collectedAt",
    },
    upgrade: (transaction) => {
      const table = transaction.table(LEGACY_OHLC_TABLE);
      return table.toCollection().modify((record) => {
        if (!record.collectedAt && record.tradeDate) {
          record.collectedAt = record.tradeDate;
        }
      });
    },
  },
  3: {
    stores: {
      [SNAPSHOT_TABLE]: "[id+dateTime], id, dateTime, status",
      [LEGACY_OHLC_TABLE]: null,
    },
  },
  4: {
    stores: {
      [SNAPSHOT_TABLE]: "[id+dateTime], id, dateTime, status",
      [ANALYSIS_CACHE_TABLE]: "symbol, lastAnalyzedAt",
      [LEGACY_OHLC_TABLE]: null,
    },
  },
};

export const DB_VERSION = Math.max(...Object.keys(SCHEMA_MIGRATIONS).map(Number));
