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
    lastTrade: normalizeNumeric(record.lastTrade),
    closingPrice: normalizeNumeric(record.closingPrice),
    firstPrice: normalizeNumeric(record.firstPrice),
    tradesCount: normalizeNumeric(record.tradesCount),
    tradingVolume: normalizeNumeric(record.tradingVolume),
    tradingValue: normalizeNumeric(record.tradingValue),
    marketValue: normalizeNumeric(record.marketValue),
    lastPriceTime: normalizeText(record.lastPriceTime),
    status: normalizeText(record.status),
    dailyLowRange: normalizeNumeric(record.dailyLowRange),
    dailyHighRange: normalizeNumeric(record.dailyHighRange),
    allowedLowPrice: normalizeNumeric(record.allowedLowPrice),
    allowedHighPrice: normalizeNumeric(record.allowedHighPrice),
    shareCount: normalizeNumeric(record.shareCount),
    baseVolume: normalizeNumeric(record.baseVolume),
    floatingShares: normalizeNumeric(record.floatingShares),
    averageMonthlyVolume: normalizeNumeric(record.averageMonthlyVolume),
    realBuyVolume: normalizeNumeric(record.realBuyVolume),
    realSellVolume: normalizeNumeric(record.realSellVolume),
    legalBuyVolume: normalizeNumeric(record.legalBuyVolume),
    legalSellVolume: normalizeNumeric(record.legalSellVolume),
    realBuyCount: normalizeNumeric(record.realBuyCount),
    realSellCount: normalizeNumeric(record.realSellCount),
    legalBuyCount: normalizeNumeric(record.legalBuyCount),
    legalSellCount: normalizeNumeric(record.legalSellCount),
    totalBuyCount: normalizeNumeric(record.totalBuyCount),
    totalSellCount: normalizeNumeric(record.totalSellCount),
  };

  const computedTotalBuyVolume = sumNumbers(payload.realBuyVolume, payload.legalBuyVolume);
  const computedTotalSellVolume = sumNumbers(payload.realSellVolume, payload.legalSellVolume);

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
