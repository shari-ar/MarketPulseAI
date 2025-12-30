import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../runtime-config.js";
import { marketDateFromIso } from "../background/time.js";

function formatSystemTimestamp(date = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const millisecond = pad(date.getMilliseconds(), 3);
  const offsetMinutes = -date.getTimezoneOffset();
  if (offsetMinutes === 0) {
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`;
  }

  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}${sign}${offsetHours}:${offsetMins}`;
}

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
 * Removes stale stock records beyond the configured retention window.
 *
 * @param {Array<object>} records - Raw stock rows from IndexedDB.
 * @param {object} options
 * @param {Date} [options.now=new Date()] - Clock used for deterministic tests.
 * @param {number} [options.retentionDays=DEFAULT_RUNTIME_CONFIG.RETENTION_DAYS]
 *   Max age for stocks before pruning.
 * @param {import("../background/logger.js").LoggingService} [options.logger]
 *   Structured logger for recording retention outcomes.
 * @returns {Array<object>} Pruned stock collection.
 */
export function pruneStocks(
  records = [],
  {
    now = new Date(),
    retentionDays = DEFAULT_RUNTIME_CONFIG.RETENTION_DAYS,
    logger,
    config = DEFAULT_RUNTIME_CONFIG,
  } = {}
) {
  const runtimeConfig = getRuntimeConfig(config);
  const today = marketDateFromIso(now.toISOString(), runtimeConfig);
  const before = records.length;

  logger?.log?.({
    type: "debug",
    message: "Evaluating stock retention",
    source: "storage",
    context: {
      recordCount: before,
      retentionDays,
      marketDate: today,
      timezone: runtimeConfig.MARKET_TIMEZONE,
    },
    now,
  });
  const pruned = records.filter((record) => {
    const recordDate = marketDateFromIso(record.dateTime, runtimeConfig);
    if (!recordDate) return false;
    return daysBetween(recordDate, today) < retentionDays;
  });
  logger?.log?.({
    type: "debug",
    message: "Stock retention filter applied",
    source: "storage",
    context: { remaining: pruned.length, removed: before - pruned.length },
    now,
  });

  const removed = before - pruned.length;
  if (logger) {
    logger.log({
      type: "info",
      message: "Pruned stocks past retention window",
      source: "storage",
      context: {
        removedCount: removed,
        retentionDays,
        marketDate: today,
        timezone: runtimeConfig.MARKET_TIMEZONE,
      },
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

  logger?.log?.({
    type: "debug",
    message: "Evaluating log retention",
    source: "storage",
    context: { recordCount: before, now: now.toISOString() },
    now,
  });
  const filtered = records.filter((entry) => {
    const expires = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : null;
    if (!expires) return true;
    return expires > nowTs;
  });
  logger?.log?.({
    type: "debug",
    message: "Log retention filter applied",
    source: "storage",
    context: { remaining: filtered.length, removed: before - filtered.length },
    now,
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
 * @param {string} [params.pageUrl] - URL of the page where the log occurred.
 * @param {number} [params.ttlDays] - Days until automatic expiry.
 * @param {Date} [now=new Date()] - Clock used for deterministic tests.
 * @returns {object} Log entry ready for persistence.
 */
export function buildLogEntry(
  { type, message, context = {}, source = "navigation", ttlDays, pageUrl },
  now = new Date()
) {
  const createdAt = formatSystemTimestamp(now);
  const expiresAt = ttlDays
    ? formatSystemTimestamp(new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000))
    : null;
  const resolvedPageUrl = pageUrl ?? context?.pageUrl ?? context?.url ?? context?.tabUrl ?? null;
  const normalizedContext =
    resolvedPageUrl && context?.pageUrl !== resolvedPageUrl
      ? { ...context, pageUrl: resolvedPageUrl }
      : context;
  return {
    type,
    message,
    context: normalizedContext,
    source,
    createdAt,
    expiresAt,
    pageUrl: resolvedPageUrl,
  };
}
