/**
 * Default runtime configuration mirrors the documented settings in `docs/configuration.md`.
 * Environment variables can override any value using the `MARKETPULSEAI_` prefix, keeping
 * the extension configurable without code changes (e.g., `MARKETPULSEAI_TOP_SWING_COUNT=7`).
 */
export const LOG_LEVELS = ["error", "warning", "info", "debug"];

export const DEFAULT_RUNTIME_CONFIG = {
  DB_NAME: "marketpulseai",
  MARKET_TIMEZONE: "Asia/Tehran",
  MARKET_OPEN: "09:00",
  MARKET_CLOSE: "13:00",
  ANALYSIS_DEADLINE: "07:00",
  TRADING_DAYS: [6, 0, 1, 2, 3],
  RETENTION_DAYS: 7,
  TOP_SWING_COUNT: 5,
  SYMBOL_URL_TEMPLATE: "https://tsetmc.com/instInfo/{symbol}",
  NAVIGATION_READY_SELECTOR: "body",
  NAVIGATION_WAIT_TIMEOUT_MS: 15000,
  NAVIGATION_POLL_INTERVAL_MS: 250,
  NAVIGATION_RETRY_LIMIT: 10,
  NAVIGATION_RETRY_DELAY_MS: 1000,
  PARSING_SELECTORS: null,
  LOG_RETENTION_DAYS: {
    error: 30,
    warning: 7,
    info: 3,
    debug: 1,
  },
};

const ENV_PREFIX = "MARKETPULSEAI_";
let STORED_RUNTIME_CONFIG = {};

/**
 * Cache runtime overrides in memory (e.g., from popup settings).
 *
 * @param {object} [overrides={}] - Runtime configuration overrides to store.
 */
export function setStoredRuntimeConfig(overrides = {}) {
  STORED_RUNTIME_CONFIG = { ...overrides };
}

/**
 * Read the currently cached runtime overrides without exposing mutability.
 *
 * @returns {object} Shallow copy of stored runtime overrides.
 */
export function getStoredRuntimeConfig() {
  return { ...STORED_RUNTIME_CONFIG };
}

/**
 * Determine the environment source for runtime overrides (Node, injected, or empty).
 *
 * @returns {object} Environment-like key/value map.
 */
function getEnvSource() {
  const maybeProcess = typeof globalThis !== "undefined" ? globalThis.process : undefined;
  if (maybeProcess?.env) return maybeProcess.env;
  if (typeof globalThis !== "undefined" && globalThis.MarketPulseAIEnv) {
    return globalThis.MarketPulseAIEnv;
  }
  return {};
}

/**
 * Parse trading day overrides from env strings into numeric weekday indexes.
 *
 * @param {unknown} value - Raw env input.
 * @returns {number[]|null} Sanitized trading day list.
 */
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

/**
 * Normalize log retention overrides from env sources.
 *
 * @param {object} env - Environment map to parse.
 * @returns {object|null} Per-level retention map.
 */
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

/**
 * Parse a JSON-like env value into an object literal.
 *
 * @param {string|undefined} value - Raw env value.
 * @returns {object|null} Parsed object or null if invalid.
 */
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

/**
 * Emit a succinct summary of active environment overrides for observability.
 *
 * @param {object} envConfig - Resolved environment overrides.
 */
function logEnvOverrides(envConfig) {
  const keys = Object.keys(envConfig || {});
  if (!keys.length) return;
  console.info(`Loaded runtime config overrides from environment: ${keys.sort().join(", ")}`); // eslint-disable-line no-console
}

/**
 * Compute runtime configuration overrides supplied via env variables.
 *
 * @returns {object} Normalized environment overrides.
 */
function loadEnvRuntimeConfig() {
  const env = getEnvSource();
  const tradingDays = parseTradingDays(env[`${ENV_PREFIX}TRADING_DAYS`]);
  const logRetention = parseLogRetention(env);
  const parsingSelectors = parseJsonEnv(env[`${ENV_PREFIX}PARSING_SELECTORS`]);

  const config = {
    DB_NAME: env[`${ENV_PREFIX}DB_NAME`],
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
    NAVIGATION_RETRY_DELAY_MS: env[`${ENV_PREFIX}NAVIGATION_RETRY_DELAY_MS`]
      ? Number(env[`${ENV_PREFIX}NAVIGATION_RETRY_DELAY_MS`])
      : undefined,
    PARSING_SELECTORS: parsingSelectors || undefined,
    LOG_RETENTION_DAYS: logRetention || undefined,
  };

  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined && value !== null)
  );
}

const ENV_RUNTIME_CONFIG = loadEnvRuntimeConfig();
logEnvOverrides(ENV_RUNTIME_CONFIG);

/**
 * Resolve the effective runtime configuration, honoring stored, env, and call overrides.
 *
 * @param {object} [overrides={}] - Per-call overrides for runtime settings.
 * @returns {object} Merged runtime configuration.
 */
export function getRuntimeConfig(overrides = {}) {
  const base = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...STORED_RUNTIME_CONFIG,
    ...ENV_RUNTIME_CONFIG,
    ...overrides,
  };

  return {
    ...base,
    LOG_RETENTION_DAYS: {
      ...DEFAULT_RUNTIME_CONFIG.LOG_RETENTION_DAYS,
      ...(STORED_RUNTIME_CONFIG.LOG_RETENTION_DAYS || {}),
      ...(ENV_RUNTIME_CONFIG.LOG_RETENTION_DAYS || {}),
      ...(overrides.LOG_RETENTION_DAYS || {}),
    },
  };
}
