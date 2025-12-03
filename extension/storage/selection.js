import db from "./db.js";
import { SNAPSHOT_TABLE } from "./schema.js";
import { currentMarketDate, marketDateFromIso } from "../time.js";

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

function normalizeTimestamp(dateTime) {
  if (!dateTime) return Number.NEGATIVE_INFINITY;
  const value = new Date(dateTime).getTime();
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function pickLatestBySymbol(records = []) {
  const latest = new Map();

  for (const record of records || []) {
    if (!record?.id) continue;
    const existing = latest.get(record.id);

    if (!existing) {
      latest.set(record.id, record);
      continue;
    }

    const nextTime = normalizeTimestamp(record.dateTime);
    const prevTime = normalizeTimestamp(existing.dateTime);

    if (nextTime >= prevTime) {
      latest.set(record.id, record);
    }
  }

  return Array.from(latest.values());
}

export async function findSymbolsMissingToday(today = currentMarketDate()) {
  await db.open();
  const records = await db.table(SNAPSHOT_TABLE).toArray();
  const latestPerSymbol = pickLatestBySymbol(records);

  return latestPerSymbol
    .filter((record) => marketDateFromIso(record?.dateTime) !== today)
    .map((record) => record.id);
}

export function selectTickerFromOldest(
  records = [],
  { sampleSize = 10, seed = DEFAULT_SEED } = {}
) {
  const ordered = records
    .filter((record) => record?.id)
    .map((record) => ({
      id: record.id,
      dateTime: record.dateTime ?? null,
      timestamp: normalizeTimestamp(record.dateTime),
    }))
    .sort((a, b) => {
      if (a.timestamp === b.timestamp) {
        return a.id.localeCompare(b.id);
      }
      return a.timestamp - b.timestamp;
    });

  const unique = [];
  const seen = new Set();

  for (const entry of ordered) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    unique.push({ id: entry.id, dateTime: entry.dateTime });
    if (unique.length >= sampleSize) break;
  }

  if (unique.length === 0) {
    return null;
  }

  const rng = createSeededRandom(seed);
  const index = Math.floor(rng() * unique.length);
  return unique[index];
}

export async function chooseOldestTicker({ sampleSize = 10, seed = DEFAULT_SEED } = {}) {
  await db.open();
  const limited = await db
    .table(SNAPSHOT_TABLE)
    .orderBy("dateTime")
    .limit(sampleSize * 3)
    .toArray();

  const pick = selectTickerFromOldest(limited, { sampleSize, seed });
  if (pick || limited.length >= sampleSize * 3) {
    return pick;
  }

  const fullRecords = await db.table(SNAPSHOT_TABLE).orderBy("dateTime").toArray();
  return selectTickerFromOldest(fullRecords, { sampleSize, seed });
}
