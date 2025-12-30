import {
  DEFAULT_RUNTIME_CONFIG,
  LOG_LEVELS,
  getRuntimeConfig,
  setStoredRuntimeConfig,
} from "./runtime-config.js";

export const RUNTIME_CONFIG_STORAGE_KEY = "runtimeConfig";

// Keys that expect numeric values for runtime configuration overrides.
const NUMERIC_KEYS = new Set([
  "RETENTION_DAYS",
  "TOP_SWING_COUNT",
  "NAVIGATION_WAIT_TIMEOUT_MS",
  "NAVIGATION_POLL_INTERVAL_MS",
  "NAVIGATION_RETRY_LIMIT",
  "NAVIGATION_RETRY_DELAY_MS",
]);

// Keys that expect non-empty string values for runtime configuration overrides.
const STRING_KEYS = new Set([
  "DB_NAME",
  "MARKET_TIMEZONE",
  "MARKET_OPEN",
  "MARKET_CLOSE",
  "ANALYSIS_DEADLINE",
  "SYMBOL_URL_TEMPLATE",
  "NAVIGATION_READY_SELECTOR",
]);

/**
 * Normalize log retention inputs into a finite days-per-level map.
 *
 * @param {unknown} value - Raw log retention configuration.
 * @returns {object|undefined} Normalized retention map or undefined if invalid.
 */
function normalizeLogRetention(value) {
  if (!value || typeof value !== "object") return undefined;
  const normalized = {};
  LOG_LEVELS.forEach((level) => {
    const raw = value[level];
    if (raw === "" || raw === null || raw === undefined) return;
    const days = Number(raw);
    if (Number.isFinite(days)) normalized[level] = days;
  });
  return Object.keys(normalized).length ? normalized : undefined;
}

/**
 * Normalize trading days as numeric weekday indexes (0-6).
 *
 * @param {unknown} value - Raw trading day input.
 * @returns {number[]|undefined} Sanitized trading day list.
 */
function normalizeTradingDays(value) {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const parsed = raw
    .map((entry) => Number(String(entry).trim()))
    .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6);
  return parsed.length ? parsed : undefined;
}

/**
 * Coerce arbitrary overrides into a safe runtime configuration subset.
 *
 * @param {object} raw - Raw configuration overrides.
 * @returns {object} Normalized overrides aligned with runtime config schema.
 */
export function normalizeRuntimeConfig(raw = {}) {
  if (!raw || typeof raw !== "object") return {};
  const normalized = {};

  Object.keys(DEFAULT_RUNTIME_CONFIG).forEach((key) => {
    if (!(key in raw)) return;
    const value = raw[key];
    if (value === "" || value === null || value === undefined) return;

    if (NUMERIC_KEYS.has(key)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) normalized[key] = parsed;
      return;
    }

    if (STRING_KEYS.has(key)) {
      if (typeof value === "string" && value.trim()) normalized[key] = value.trim();
      return;
    }

    if (key === "TRADING_DAYS") {
      const days = normalizeTradingDays(value);
      if (days) normalized[key] = days;
      return;
    }

    if (key === "LOG_RETENTION_DAYS") {
      const retention = normalizeLogRetention(value);
      if (retention) normalized[key] = retention;
      return;
    }

    if (key === "PARSING_SELECTORS" && value && typeof value === "object") {
      normalized[key] = value;
    }
  });

  return normalized;
}

/**
 * Apply configuration overrides and persist them to runtime state.
 *
 * @param {object} raw - Raw configuration overrides.
 * @param {object} [options] - Optional logging metadata.
 * @param {object} [options.logger] - Logger with a .log({type,message,context,source,now}) API.
 * @param {string} [options.source="settings"] - Source label for log entries.
 * @param {Date} [options.now=new Date()] - Clock used for deterministic tests.
 * @returns {object} Fully merged runtime configuration.
 */
export function applyRuntimeConfigOverrides(
  raw = {},
  { logger, source = "settings", now = new Date() } = {}
) {
  logger?.log?.({
    type: "debug",
    message: "Normalizing runtime config overrides",
    source,
    context: { requestedKeys: Object.keys(raw || {}) },
    now,
  });
  const normalized = normalizeRuntimeConfig(raw);
  setStoredRuntimeConfig(normalized);
  logger?.log?.({
    type: "debug",
    message: "Stored runtime config overrides",
    source,
    context: { appliedKeys: Object.keys(normalized) },
    now,
  });
  if (logger?.log) {
    const requestedKeys = Object.keys(raw || {});
    const appliedKeys = Object.keys(normalized);
    const ignoredKeys = requestedKeys.filter((key) => !appliedKeys.includes(key));
    logger.log({
      type: "debug",
      message: "Applied runtime configuration overrides",
      source,
      context: {
        requestedKeys,
        appliedKeys,
        ignoredKeys,
      },
      now,
    });
  }
  return getRuntimeConfig();
}
