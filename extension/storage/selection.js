import db from "./db.js";
import { OHLC_TABLE } from "./schema.js";

const DEFAULT_SEED = "marketpulseai-oldest";

const TWO32 = 2 ** 32;

function hashSeed(seed) {
  return Array.from(String(seed)).reduce((hash, char) => {
    const next = (hash << 5) - hash + char.charCodeAt(0);
    return next >>> 0;
  }, 0);
}

function createSeededRandom(seed = DEFAULT_SEED) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % TWO32;
    return state / TWO32;
  };
}

function normalizeTimestamp(collectedAt) {
  if (!collectedAt) return Number.NEGATIVE_INFINITY;
  const value = new Date(collectedAt).getTime();
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

export function selectTickerFromOldest(
  records,
  { sampleSize = 10, seed = DEFAULT_SEED } = {},
) {
  const ordered = records
    .filter((record) => record?.symbol)
    .map((record) => ({
      symbol: record.symbol,
      collectedAt: record.collectedAt ?? null,
      timestamp: normalizeTimestamp(record.collectedAt),
    }))
    .sort((a, b) => {
      if (a.timestamp === b.timestamp) {
        return a.symbol.localeCompare(b.symbol);
      }
      return a.timestamp - b.timestamp;
    });

  const unique = [];
  const seen = new Set();

  for (const entry of ordered) {
    if (seen.has(entry.symbol)) continue;
    seen.add(entry.symbol);
    unique.push({ symbol: entry.symbol, collectedAt: entry.collectedAt });
    if (unique.length >= sampleSize) break;
  }

  if (unique.length === 0) {
    return null;
  }

  const rng = createSeededRandom(seed);
  const index = Math.floor(rng() * unique.length);
  return unique[index];
}

export async function chooseOldestTicker({
  sampleSize = 10,
  seed = DEFAULT_SEED,
} = {}) {
  await db.open();
  const limited = await db
    .table(OHLC_TABLE)
    .orderBy("collectedAt")
    .limit(sampleSize * 3)
    .toArray();

  const pick = selectTickerFromOldest(limited, { sampleSize, seed });
  if (pick || limited.length >= sampleSize * 3) {
    return pick;
  }

  const fullRecords = await db.table(OHLC_TABLE).orderBy("collectedAt").toArray();
  return selectTickerFromOldest(fullRecords, { sampleSize, seed });
}
