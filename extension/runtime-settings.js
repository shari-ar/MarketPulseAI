import {
  DEFAULT_RUNTIME_CONFIG,
  LOG_LEVELS,
  getRuntimeConfig,
  setStoredRuntimeConfig,
} from "./runtime-config.js";

export const RUNTIME_CONFIG_STORAGE_KEY = "runtimeConfig";

const NUMERIC_KEYS = new Set([
  "RETENTION_DAYS",
  "TOP_SWING_COUNT",
  "NAVIGATION_WAIT_TIMEOUT_MS",
  "NAVIGATION_POLL_INTERVAL_MS",
  "NAVIGATION_RETRY_LIMIT",
]);

const STRING_KEYS = new Set([
  "DB_NAME",
  "MARKET_TIMEZONE",
  "MARKET_OPEN",
  "MARKET_CLOSE",
  "ANALYSIS_DEADLINE",
  "SYMBOL_URL_TEMPLATE",
  "NAVIGATION_READY_SELECTOR",
]);

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

function normalizeTradingDays(value) {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const parsed = raw
    .map((entry) => Number(String(entry).trim()))
    .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6);
  return parsed.length ? parsed : undefined;
}

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

export function applyRuntimeConfigOverrides(raw = {}) {
  const normalized = normalizeRuntimeConfig(raw);
  setStoredRuntimeConfig(normalized);
  return getRuntimeConfig();
}
