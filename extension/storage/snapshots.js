const FALLBACK_TIMESTAMP = Number.NEGATIVE_INFINITY;

function normalizeTimestamp(primary, fallback) {
  const parsed = Date.parse(primary ?? fallback ?? "");
  return Number.isFinite(parsed) ? parsed : FALLBACK_TIMESTAMP;
}

function isNewerRecord(current, previous) {
  const currentTime = normalizeTimestamp(current?.collectedAt, current?.tradeDate);
  const previousTime = normalizeTimestamp(previous?.collectedAt, previous?.tradeDate);

  if (currentTime === previousTime) {
    return String(current?.tradeDate || "").localeCompare(String(previous?.tradeDate || "")) > 0;
  }

  return currentTime > previousTime;
}

export function summarizeRecords(records = [], { recentLimit = 5 } = {}) {
  const safeLimit = Number.isFinite(recentLimit) && recentLimit > 0 ? Math.floor(recentLimit) : 0;

  const normalized = (records ?? []).filter(
    (record) => record && record.symbol && record.tradeDate
  );

  const distinctSymbols = new Set(
    normalized.map((record) => String(record.symbol).trim()).filter((symbol) => symbol.length > 0)
  );

  const sorted = [...normalized].sort((a, b) => {
    const aTime = normalizeTimestamp(a.collectedAt, a.tradeDate);
    const bTime = normalizeTimestamp(b.collectedAt, b.tradeDate);

    if (aTime === bTime) {
      return (
        String(b.tradeDate).localeCompare(String(a.tradeDate)) ||
        String(b.symbol).localeCompare(String(a.symbol))
      );
    }

    return bTime - aTime;
  });

  const mostRecent = safeLimit ? sorted.slice(0, safeLimit) : [];
  const lastCollectedAt = mostRecent[0]?.collectedAt ?? null;

  return {
    totalRecords: normalized.length,
    distinctSymbols: distinctSymbols.size,
    mostRecent,
    lastCollectedAt,
  };
}

export function latestRecordsBySymbol(records = []) {
  const latest = new Map();

  for (const record of records ?? []) {
    if (!record || !record.symbol) continue;
    const symbol = String(record.symbol).trim();
    if (!symbol) continue;

    const current = latest.get(symbol);
    if (!current || isNewerRecord(record, current)) {
      latest.set(symbol, record);
    }
  }

  return Array.from(latest.values()).sort((a, b) => {
    const timeDelta =
      normalizeTimestamp(b.collectedAt, b.tradeDate) -
      normalizeTimestamp(a.collectedAt, a.tradeDate);
    if (timeDelta !== 0) return timeDelta;
    return String(a.symbol).localeCompare(String(b.symbol));
  });
}
