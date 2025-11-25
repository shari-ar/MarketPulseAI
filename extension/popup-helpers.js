export function detectSymbolFromUrl(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/\/InstInfo\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export function pickLatestBySymbol(records = []) {
  const latest = new Map();
  for (const record of records || []) {
    if (!record || !record.symbol) continue;
    const existing = latest.get(record.symbol);
    if (!existing) {
      latest.set(record.symbol, record);
      continue;
    }

    const nextTime = record.collectedAt ? new Date(record.collectedAt).getTime() : 0;
    const prevTime = existing.collectedAt ? new Date(existing.collectedAt).getTime() : 0;

    if (!Number.isNaN(nextTime) && nextTime >= prevTime) {
      latest.set(record.symbol, record);
    }
  }
  return Array.from(latest.values());
}
