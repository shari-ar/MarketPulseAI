/**
 * Default runtime configuration mirrors the documented settings in `docs/configuration.md`.
 * Environment variables can override any value using the `MARKETPULSEAI_` prefix, keeping
 * the extension configurable without code changes (e.g., `MARKETPULSEAI_TOP_SWING_COUNT=7`).
 */
export const LOG_LEVELS = ["error", "warning", "info", "debug"];

export const DEFAULT_RUNTIME_CONFIG = {
  MARKET_TIMEZONE: "Asia/Tehran",
  MARKET_OPEN: "09:00",
  MARKET_CLOSE: "13:00",
  ANALYSIS_DEADLINE: "07:00",
  TRADING_DAYS: [6, 0, 1, 2, 3],
  RETENTION_DAYS: 7,
  TOP_SWING_COUNT: 5,
  SYMBOL_URL_TEMPLATE: "https://tsetmc.com/ins/?i={symbol}",
  NAVIGATION_READY_SELECTOR: "body",
  NAVIGATION_WAIT_TIMEOUT_MS: 15000,
  NAVIGATION_POLL_INTERVAL_MS: 250,
  NAVIGATION_RETRY_LIMIT: 2,
  PARSING_SELECTORS: null,
  LOG_RETENTION_DAYS: {
    error: 30,
    warning: 7,
    info: 3,
    debug: 1,
  },
};

const ENV_PREFIX = "MARKETPULSEAI_";

function getEnvSource() {
  const maybeProcess = typeof globalThis !== "undefined" ? globalThis.process : undefined;
  if (maybeProcess?.env) return maybeProcess.env;
  if (typeof globalThis !== "undefined" && globalThis.MarketPulseAIEnv) {
    return globalThis.MarketPulseAIEnv;
  }
  return {};
}

function parseTradingDays(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map((day) => Number(day)).filter(Number.isFinite);
  if (typeof value === "string") {
    const parts = value
      .split(",")
      .map((part) => Number(part.trim()))
      .filter(Number.isFinite);
    return parts.length ? parts : null;
  }
  return null;
}

function parseLogRetention(env) {
  const retention = {};
  const serialized = env[`${ENV_PREFIX}LOG_RETENTION_DAYS`];
  if (serialized) {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed && typeof parsed === "object") Object.assign(retention, parsed);
    } catch (error) {
      console.warn("Invalid LOG_RETENTION_DAYS env config", error); // eslint-disable-line no-console
    }
  }

  LOG_LEVELS.forEach((type) => {
    const value = env[`${ENV_PREFIX}LOG_RETENTION_${type.toUpperCase()}`];
    if (value !== undefined) {
      const days = Number(value);
      if (Number.isFinite(days)) retention[type] = days;
    }
  });

  return Object.keys(retention).length ? retention : null;
}

function parseJsonEnv(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("Invalid JSON env config", error); // eslint-disable-line no-console
  }
  return null;
}

function loadEnvRuntimeConfig() {
  const env = getEnvSource();
  const tradingDays = parseTradingDays(env[`${ENV_PREFIX}TRADING_DAYS`]);
  const logRetention = parseLogRetention(env);
  const parsingSelectors = parseJsonEnv(env[`${ENV_PREFIX}PARSING_SELECTORS`]);

  const config = {
    MARKET_TIMEZONE: env[`${ENV_PREFIX}MARKET_TIMEZONE`],
    MARKET_OPEN: env[`${ENV_PREFIX}MARKET_OPEN`],
    MARKET_CLOSE: env[`${ENV_PREFIX}MARKET_CLOSE`],
    ANALYSIS_DEADLINE: env[`${ENV_PREFIX}ANALYSIS_DEADLINE`],
    TRADING_DAYS: tradingDays,
    RETENTION_DAYS: env[`${ENV_PREFIX}RETENTION_DAYS`]
      ? Number(env[`${ENV_PREFIX}RETENTION_DAYS`])
      : undefined,
    TOP_SWING_COUNT: env[`${ENV_PREFIX}TOP_SWING_COUNT`]
      ? Number(env[`${ENV_PREFIX}TOP_SWING_COUNT`])
      : undefined,
    SYMBOL_URL_TEMPLATE: env[`${ENV_PREFIX}SYMBOL_URL_TEMPLATE`],
    NAVIGATION_READY_SELECTOR: env[`${ENV_PREFIX}NAVIGATION_READY_SELECTOR`],
    NAVIGATION_WAIT_TIMEOUT_MS: env[`${ENV_PREFIX}NAVIGATION_WAIT_TIMEOUT_MS`]
      ? Number(env[`${ENV_PREFIX}NAVIGATION_WAIT_TIMEOUT_MS`])
      : undefined,
    NAVIGATION_POLL_INTERVAL_MS: env[`${ENV_PREFIX}NAVIGATION_POLL_INTERVAL_MS`]
      ? Number(env[`${ENV_PREFIX}NAVIGATION_POLL_INTERVAL_MS`])
      : undefined,
    NAVIGATION_RETRY_LIMIT: env[`${ENV_PREFIX}NAVIGATION_RETRY_LIMIT`]
      ? Number(env[`${ENV_PREFIX}NAVIGATION_RETRY_LIMIT`])
      : undefined,
    PARSING_SELECTORS: parsingSelectors || undefined,
    LOG_RETENTION_DAYS: logRetention || undefined,
  };

  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined && value !== null)
  );
}

const ENV_RUNTIME_CONFIG = loadEnvRuntimeConfig();

export function getRuntimeConfig(overrides = {}) {
  const base = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...ENV_RUNTIME_CONFIG,
    ...overrides,
  };

  return {
    ...base,
    LOG_RETENTION_DAYS: {
      ...DEFAULT_RUNTIME_CONFIG.LOG_RETENTION_DAYS,
      ...(ENV_RUNTIME_CONFIG.LOG_RETENTION_DAYS || {}),
      ...(overrides.LOG_RETENTION_DAYS || {}),
    },
  };
}
