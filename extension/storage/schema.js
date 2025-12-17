export const DB_NAME = "marketpulseai";
export const DB_VERSION = 1;
export const SNAPSHOT_TABLE = "topBoxSnapshots";
export const ANALYSIS_CACHE_TABLE = "analysisCache";
export const LOG_TABLE = "logs";

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

export const ANALYSIS_CACHE_FIELDS = {
  symbol: "string",
  lastAnalyzedAt: "string",
};

export const LOG_FIELDS = {
  id: "number",
  type: "string",
  message: "string",
  context: "object",
  source: "string",
  createdAt: "string",
  expiresAt: "string",
};

export function getSchemaDefinition() {
  return {
    [SNAPSHOT_TABLE]: "[id+dateTime], id, dateTime, status",
    [ANALYSIS_CACHE_TABLE]: "symbol, lastAnalyzedAt",
    [LOG_TABLE]: "++id, type, createdAt, expiresAt, source",
  };
}

export function validateSnapshot(snapshot = {}) {
  return Object.keys(SNAPSHOT_FIELDS).every((key) => key in snapshot);
}
