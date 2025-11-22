export const DB_NAME = "marketpulseai";
export const OHLC_TABLE = "ohlcRecords";

export const OHLC_RECORD_FIELDS = {
  symbol: "Ticker symbol, e.g. 'FOLD'",
  tradeDate: "Trading day in YYYY-MM-DD (market calendar)",
  open: "Number: opening price",
  high: "Number: session high",
  low: "Number: session low",
  close: "Number: closing price",
  volume: "Optional number: traded volume",
  collectedAt: "ISO timestamp when data was captured",
};

export const SCHEMA_MIGRATIONS = {
  1: {
    stores: {
      [OHLC_TABLE]: "++id, symbol, tradeDate, [symbol+tradeDate]",
    },
  },
  2: {
    stores: {
      [OHLC_TABLE]: "++id, symbol, tradeDate, [symbol+tradeDate], collectedAt",
    },
    upgrade: (transaction) => {
      const table = transaction.table(OHLC_TABLE);
      return table.toCollection().modify((record) => {
        if (!record.collectedAt && record.tradeDate) {
          record.collectedAt = record.tradeDate;
        }
      });
    },
  },
};

export const DB_VERSION = Math.max(...Object.keys(SCHEMA_MIGRATIONS).map(Number));
