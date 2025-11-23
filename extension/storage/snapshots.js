const FALLBACK_TIMESTAMP = Number.NEGATIVE_INFINITY;

function normalizeTimestamp(primary, fallback) {
  const parsed = Date.parse(primary ?? fallback ?? "");
  return Number.isFinite(parsed) ? parsed : FALLBACK_TIMESTAMP;
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
