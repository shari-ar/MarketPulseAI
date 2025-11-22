import db from "./db.js";
import { OHLC_TABLE } from "./schema.js";
import { assertValidOhlcRecord, normalizeCollectedAt } from "./validation.js";

function buildPayload(record) {
  const normalizedCollectedAt = normalizeCollectedAt(record.collectedAt);
  return {
    symbol: String(record.symbol).trim(),
    tradeDate: record.tradeDate,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume ?? undefined,
    collectedAt: normalizedCollectedAt,
  };
}

export async function saveOhlcRecord(record, { table } = {}) {
  assertValidOhlcRecord(record);
  const targetTable = table ?? db.table(OHLC_TABLE);
  const payload = buildPayload(record);
  return targetTable.add(payload);
}
