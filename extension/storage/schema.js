/**
 * IndexedDB configuration for all persisted extension data.
 * Naming is shared with Dexie setup in the background scripts.
 */
export const DB_NAME = "marketpulseai";
export const DB_VERSION = 1;
export const SNAPSHOT_TABLE = "topBoxSnapshots";
export const ANALYSIS_CACHE_TABLE = "analysisCache";
export const LOG_TABLE = "logs";

/**
 * Schema definition for raw market snapshots captured by the navigator.
 * Types align with worker scoring expectations to avoid casting on read.
 */
export const SNAPSHOT_FIELDS = {
  id: "string",
  dateTime: "string",
  symbolName: "string",
  symbolAbbreviation: "string",
  predictedSwingPercent: "number",
  predictedSwingProbability: "number",
  close: "number",
  primeCost: "number",
  open: "number",
  tradesCount: "number",
  tradingVolume: "number",
  tradingValue: "number",
  marketValue: "number",
  closeTime: "string",
  status: "string",
  low: "number",
  high: "number",
  allowedLow: "number",
  allowedHigh: "number",
  shareCount: "number",
  baseVolume: "number",
  floatingShares: "number",
  averageMonthlyVolume: "number",
  naturalBuyVolume: "number",
  naturalSellVolume: "number",
  juridicalBuyVolume: "number",
  juridicalSellVolume: "number",
  totalBuyVolume: "number",
  totalSellVolume: "number",
  naturalBuyCount: "number",
  naturalSellCount: "number",
  juridicalBuyCount: "number",
  juridicalSellCount: "number",
  totalBuyCount: "number",
  totalSellCount: "number",
};

/**
 * Tracks when a symbol was last analyzed to throttle redundant runs.
 */
export const ANALYSIS_CACHE_FIELDS = {
  symbol: "string",
  lastAnalyzedAt: "string",
};

/**
 * Storage contract for lightweight diagnostics and lifecycle breadcrumbs.
 */
export const LOG_FIELDS = {
  id: "number",
  type: "string",
  message: "string",
  context: "object",
  source: "string",
  createdAt: "string",
  expiresAt: "string",
};

/**
 * Dexie-compatible table definitions, including compound and primary keys.
 */
export function getSchemaDefinition() {
  return {
    [SNAPSHOT_TABLE]: "[id+dateTime], id, dateTime, status",
    [ANALYSIS_CACHE_TABLE]: "symbol, lastAnalyzedAt",
    [LOG_TABLE]: "++id, type, createdAt, expiresAt, source",
  };
}

/**
 * Ensures a snapshot object has every required property before persistence.
 *
 * @param {object} snapshot - Candidate snapshot to validate.
 * @returns {boolean} True when all declared fields are present.
 */
export function validateSnapshot(snapshot = {}) {
  return Object.keys(SNAPSHOT_FIELDS).every((key) => key in snapshot);
}
