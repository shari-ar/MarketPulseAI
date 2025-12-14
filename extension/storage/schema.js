export const DB_NAME = "marketpulseai";
export const SNAPSHOT_TABLE = "topBoxSnapshots";
export const ANALYSIS_CACHE_TABLE = "analysisCache";

export const SNAPSHOT_FIELDS = {
  id: "Symbol identifier (instrument id)",
  dateTime: "ISO timestamp when the snapshot was captured",
  symbolName: "Full symbol name from header",
  symbolAbbreviation: "Ticker abbreviation from header",
  predictedSwingPercent: "Number: model-predicted swing percentage for the next session",
  lastTrade: "Number: last trade price",
  closingPrice: "Number: closing price",
  firstPrice: "Number: first price of the session",
  tradesCount: "Number: count of trades",
  tradingVolume: "Number: volume traded",
  tradingValue: "Number: value traded",
  marketValue: "Number: market value",
  lastPriceTime: "String: latest price info time shown on page",
  status: "String: trading status",
  dailyLowRange: "Number: low end of daily range",
  dailyHighRange: "Number: high end of daily range",
  allowedLowPrice: "Number: lower bound of allowed price",
  allowedHighPrice: "Number: upper bound of allowed price",
  shareCount: "Number of outstanding shares",
  baseVolume: "Number: base volume",
  floatingShares: "Number: floating shares percentage",
  averageMonthlyVolume: "Number: average volume over past month",
  realBuyVolume: "Number: individual investors' buy volume",
  realSellVolume: "Number: individual investors' sell volume",
  legalBuyVolume: "Number: institutional buy volume",
  legalSellVolume: "Number: institutional sell volume",
  totalBuyVolume: "Number: combined buy volume",
  totalSellVolume: "Number: combined sell volume",
  realBuyCount: "Number: individual buy orders count",
  realSellCount: "Number: individual sell orders count",
  legalBuyCount: "Number: institutional buy orders count",
  legalSellCount: "Number: institutional sell orders count",
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
