import db from "./db.js";
import { ANALYSIS_CACHE_TABLE } from "./schema.js";

function normalizeSymbol(symbol) {
  if (symbol === undefined || symbol === null) return null;
  const normalized = String(symbol).trim();
  return normalized || null;
}

function normalizeIsoTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    throw new Error("Analysis timestamp must be a valid date/time value.");
  }
  return date.toISOString();
}

function toMillis(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

async function resolveTable(table) {
  if (table) {
    return table;
  }
  await db.open();
  return db.table(ANALYSIS_CACHE_TABLE);
}

export async function getCachedAnalysis(symbol, { table } = {}) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;

  const targetTable = await resolveTable(table);
  const record = await targetTable.get(normalized);
  return record ?? null;
}

export async function cacheAnalysisTimestampsForSymbols(
  symbols,
  { analyzedAt = new Date(), table } = {}
) {
  const uniqueSymbols = Array.from(
    new Set(
      (Array.isArray(symbols) ? symbols : []).map((entry) => normalizeSymbol(entry)).filter(Boolean)
    )
  );

  if (uniqueSymbols.length === 0) {
    return 0;
  }

  const targetTable = await resolveTable(table);
  const timestamp = normalizeIsoTimestamp(analyzedAt);

  await Promise.all(
    uniqueSymbols.map((symbol) => targetTable.put({ symbol, lastAnalyzedAt: timestamp }))
  );

  return uniqueSymbols.length;
}

export async function cacheRankedAnalysisTimestamps(rankedResults, options = {}) {
  const symbols = Array.isArray(rankedResults)
    ? rankedResults.map((result) => result?.symbol).filter(Boolean)
    : [];

  return cacheAnalysisTimestampsForSymbols(symbols, options);
}

export async function isAnalysisFreshForSymbol(symbol, { latestDataTimestamp, table } = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return false;

  const dataTimestamp = toMillis(latestDataTimestamp);
  if (!Number.isFinite(dataTimestamp)) return false;

  const cached = await getCachedAnalysis(normalizedSymbol, { table });
  const cachedTimestamp = toMillis(cached?.lastAnalyzedAt);

  if (!Number.isFinite(cachedTimestamp)) {
    return false;
  }

  return cachedTimestamp >= dataTimestamp;
}
