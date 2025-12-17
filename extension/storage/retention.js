import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";
import { marketDateFromIso } from "../background/time.js";

function daysBetween(startDate, endDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.floor((end - start) / msPerDay);
}

export function pruneSnapshots(
  records = [],
  { now = new Date(), retentionDays = DEFAULT_RUNTIME_CONFIG.RETENTION_DAYS } = {}
) {
  const today = marketDateFromIso(now.toISOString());
  return records.filter((record) => {
    const recordDate = marketDateFromIso(record.dateTime);
    if (!recordDate) return false;
    return daysBetween(recordDate, today) < retentionDays;
  });
}

export function pruneLogs(records = [], { now = new Date() } = {}) {
  const nowTs = now.getTime();
  return records.filter((entry) => {
    const expires = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : null;
    if (!expires) return true;
    return expires > nowTs;
  });
}

export function buildLogEntry(
  { type, message, context = {}, source = "navigation", ttlDays },
  now = new Date()
) {
  const createdAt = now.toISOString();
  const expiresAt = ttlDays
    ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  return { type, message, context, source, createdAt, expiresAt };
}
