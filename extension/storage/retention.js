import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";
import { marketDateFromIso } from "../background/time.js";

/**
 * Calculates whole days between two ISO-like dates.
 * Using floor keeps retention windows consistent with market-day pruning.
 *
 * @param {string|Date} startDate - Beginning of the window.
 * @param {string|Date} endDate - End of the window.
 * @returns {number} Full days elapsed.
 */
function daysBetween(startDate, endDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.floor((end - start) / msPerDay);
}

/**
 * Removes stale snapshot records beyond the configured retention window.
 *
 * @param {Array<object>} records - Raw snapshot rows from IndexedDB.
 * @param {object} options
 * @param {Date} [options.now=new Date()] - Clock used for deterministic tests.
 * @param {number} [options.retentionDays=DEFAULT_RUNTIME_CONFIG.RETENTION_DAYS]
 *   Max age for snapshots before pruning.
 * @param {import("../background/logger.js").LoggingService} [options.logger]
 *   Structured logger for recording retention outcomes.
 * @returns {Array<object>} Pruned snapshot collection.
 */
export function pruneSnapshots(
  records = [],
  { now = new Date(), retentionDays = DEFAULT_RUNTIME_CONFIG.RETENTION_DAYS, logger } = {}
) {
  const today = marketDateFromIso(now.toISOString());
  const before = records.length;

  const pruned = records.filter((record) => {
    const recordDate = marketDateFromIso(record.dateTime);
    if (!recordDate) return false;
    return daysBetween(recordDate, today) < retentionDays;
  });

  const removed = before - pruned.length;
  if (logger) {
    logger.log({
      type: "info",
      message: "Pruned snapshots past retention window",
      source: "storage",
      context: { removedCount: removed, retentionDays, marketDate: today },
      now,
    });
  }

  return pruned;
}

/**
 * Drops expired log entries while retaining non-expiring diagnostics.
 *
 * @param {Array<object>} records - Log rows to evaluate.
 * @param {object} options
 * @param {Date} [options.now=new Date()] - Current time source.
 * @param {import("../background/logger.js").LoggingService} [options.logger]
 *   Structured logger for recording retention outcomes.
 * @returns {Array<object>} Logs still considered active.
 */
export function pruneLogs(records = [], { now = new Date(), logger } = {}) {
  const nowTs = now.getTime();
  const before = records.length;

  const filtered = records.filter((entry) => {
    const expires = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : null;
    if (!expires) return true;
    return expires > nowTs;
  });

  const removed = before - filtered.length;
  if (logger) {
    logger.log({
      type: "info",
      message: "Pruned expired log entries",
      source: "storage",
      context: { removedCount: removed },
      now,
    });
  }

  return filtered;
}

/**
 * Builds a standardized log entry with optional time-to-live.
 *
 * @param {object} params
 * @param {string} params.type - Category of log (e.g., error, info).
 * @param {string} params.message - Human-readable description.
 * @param {object} [params.context={}] - Structured metadata.
 * @param {string} [params.source="navigation"] - Originating module.
 * @param {number} [params.ttlDays] - Days until automatic expiry.
 * @param {Date} [now=new Date()] - Clock used for deterministic tests.
 * @returns {object} Log entry ready for persistence.
 */
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
