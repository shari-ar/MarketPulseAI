export function detectSymbolFromUrl(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/\/InstInfo\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export function pickLatestBySymbol(records = []) {
  const latest = new Map();
  for (const record of records || []) {
    if (!record || !record.id) continue;
    const existing = latest.get(record.id);
    if (!existing) {
      latest.set(record.id, record);
      continue;
    }

    const nextTime = record.dateTime ? new Date(record.dateTime).getTime() : 0;
    const prevTime = existing.dateTime ? new Date(existing.dateTime).getTime() : 0;

    if (!Number.isNaN(nextTime) && nextTime >= prevTime) {
      latest.set(record.id, record);
    }
  }
  return Array.from(latest.values());
}
