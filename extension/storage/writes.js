import db from "./db.js";
import { SNAPSHOT_TABLE } from "./schema.js";
import {
  assertValidSnapshotRecord,
  normalizeDateTime,
  normalizeNumeric,
  normalizeText,
} from "./validation.js";

function sumNumbers(...values) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((total, value) => total + value, 0);
}

function buildPayload(record) {
  const normalizedDateTime = normalizeDateTime(record.dateTime);

  const payload = {
    id: String(record.id).trim(),
    dateTime: normalizedDateTime,
    symbolName: normalizeText(record.symbolName),
    symbolAbbreviation: normalizeText(record.symbolAbbreviation),
    predictedSwingPercent: normalizeNumeric(record.predictedSwingPercent),
    close: normalizeNumeric(record.close),
    primeCost: normalizeNumeric(record.primeCost),
    open: normalizeNumeric(record.open),
    tradesCount: normalizeNumeric(record.tradesCount),
    tradingVolume: normalizeNumeric(record.tradingVolume),
    tradingValue: normalizeNumeric(record.tradingValue),
    marketValue: normalizeNumeric(record.marketValue),
    closeTime: normalizeText(record.closeTime),
    status: normalizeText(record.status),
    low: normalizeNumeric(record.low),
    high: normalizeNumeric(record.high),
    allowedLow: normalizeNumeric(record.allowedLow),
    allowedHigh: normalizeNumeric(record.allowedHigh),
    shareCount: normalizeNumeric(record.shareCount),
    baseVolume: normalizeNumeric(record.baseVolume),
    floatingShares: normalizeNumeric(record.floatingShares),
    averageMonthlyVolume: normalizeNumeric(record.averageMonthlyVolume),
    naturalBuyVolume: normalizeNumeric(record.naturalBuyVolume),
    naturalSellVolume: normalizeNumeric(record.naturalSellVolume),
    juridicalBuyVolume: normalizeNumeric(record.juridicalBuyVolume),
    juridicalSellVolume: normalizeNumeric(record.juridicalSellVolume),
    naturalBuyCount: normalizeNumeric(record.naturalBuyCount),
    naturalSellCount: normalizeNumeric(record.naturalSellCount),
    juridicalBuyCount: normalizeNumeric(record.juridicalBuyCount),
    juridicalSellCount: normalizeNumeric(record.juridicalSellCount),
    totalBuyCount: normalizeNumeric(record.totalBuyCount),
    totalSellCount: normalizeNumeric(record.totalSellCount),
  };

  const computedTotalBuyVolume = sumNumbers(payload.naturalBuyVolume, payload.juridicalBuyVolume);
  const computedTotalSellVolume = sumNumbers(
    payload.naturalSellVolume,
    payload.juridicalSellVolume
  );

  payload.totalBuyVolume = normalizeNumeric(record.totalBuyVolume) ?? computedTotalBuyVolume;
  payload.totalSellVolume = normalizeNumeric(record.totalSellVolume) ?? computedTotalSellVolume;

  return payload;
}

export async function saveSnapshotRecord(record, { table } = {}) {
  assertValidSnapshotRecord(record);
  const targetTable = table ?? db.table(SNAPSHOT_TABLE);
  const payload = buildPayload(record);
  return targetTable.add(payload);
}
