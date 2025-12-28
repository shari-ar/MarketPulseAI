const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { logInfo, logWarn } = require("./logger");

// Default configuration values used when environment overrides are absent.
const DEFAULTS = {
  tsetmcBaseUrl: "https://www.tsetmc.com",
  symbolUrlTemplate: "https://tsetmc.com/ins/?i={symbol}",
  marketLockStartTime: "09:00",
  marketLockEndTime: "13:00",
  analysisDeadline: "07:00",
  marketTimezone: "Asia/Tehran",
  tradingDays: [6, 0, 1, 2, 3],
  dexieDbName: "marketpulseai",
  dexieDbVersion: 1,
  retentionDays: 7,
  topSwingCount: 5,
  logRetentionDays: { error: 30, warning: 7, info: 3 },
  navigationReadySelector: "body",
  navigationWaitTimeoutMs: 15000,
  navigationPollIntervalMs: 250,
  navigationRetryLimit: 2,
  parsingSelectors: null,
  extensionSrcDir: "extension",
  extensionDistDir: "dist/extension",
};

// Explicit list of environment variables that may override defaults.
const OVERRIDE_KEYS = [
  "TSETMC_BASE_URL",
  "SYMBOL_URL_TEMPLATE",
  "MARKET_LOCK_START_TIME",
  "MARKET_LOCK_END_TIME",
  "ANALYSIS_DEADLINE",
  "MARKET_TIMEZONE",
  "TRADING_DAYS",
  "DEXIE_DB_NAME",
  "DEXIE_DB_VERSION",
  "RETENTION_DAYS",
  "TOP_SWING_COUNT",
  "NAVIGATION_READY_SELECTOR",
  "NAVIGATION_WAIT_TIMEOUT_MS",
  "NAVIGATION_POLL_INTERVAL_MS",
  "NAVIGATION_RETRY_LIMIT",
  "PARSING_SELECTORS",
  "EXTENSION_SRC_DIR",
  "EXTENSION_DIST_DIR",
];

/**
 * Parse a numeric env value and warn when invalid.
 *
 * @param {string|undefined} value - Raw env value.
 * @param {number} fallback - Default value when parsing fails.
 * @param {string} label - Friendly label for log messages.
 * @returns {number} Parsed integer or fallback.
 */
function parseIntOrDefault(value, fallback, label) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    if (value !== undefined) {
      logWarn(`Invalid integer for ${label}; using default value.`);
    }
    return fallback;
  }
  return parsed;
}

/**
 * Parse a JSON env value and warn when invalid.
 *
 * @param {string|undefined} value - Raw env value.
 * @param {any} fallback - Default value when parsing fails.
 * @param {string} label - Friendly label for log messages.
 * @returns {any} Parsed JSON or fallback.
 */
function parseJsonOrDefault(value, fallback, label) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    logWarn(`Invalid JSON for ${label}; using default value.`);
    return fallback;
  }
}

/**
 * Load environment configuration with explicit defaults and log active overrides.
 *
 * @returns {object} Resolved build configuration.
 */
function loadEnvConfig() {
  const projectRoot = path.resolve(__dirname, "..");
  const envPath = path.join(projectRoot, ".env");
  // Load .env from project root to provide optional overrides.
  const result = dotenv.config({ path: envPath });
  if (result?.error) {
    if (result.error.code === "ENOENT") {
      logInfo("No .env file found; using defaults and process environment overrides.");
    } else {
      logWarn(`Failed to load .env file at ${envPath}.`);
    }
  } else if (result?.parsed) {
    logInfo("Loaded environment overrides from .env.");
  }

  const overrideKeys = OVERRIDE_KEYS.filter((key) => process.env[key] !== undefined);
  if (overrideKeys.length) {
    logInfo(`Using ${overrideKeys.length} environment override(s): ${overrideKeys.join(", ")}`);
  } else {
    logInfo("No environment overrides detected; defaults will be used.");
  }

  return {
    tsetmcBaseUrl: process.env.TSETMC_BASE_URL || DEFAULTS.tsetmcBaseUrl,
    symbolUrlTemplate: process.env.SYMBOL_URL_TEMPLATE || DEFAULTS.symbolUrlTemplate,
    marketLockStartTime: process.env.MARKET_LOCK_START_TIME || DEFAULTS.marketLockStartTime,
    marketLockEndTime: process.env.MARKET_LOCK_END_TIME || DEFAULTS.marketLockEndTime,
    analysisDeadline: process.env.ANALYSIS_DEADLINE || DEFAULTS.analysisDeadline,
    marketTimezone: process.env.MARKET_TIMEZONE || DEFAULTS.marketTimezone,
    tradingDays: parseJsonOrDefault(process.env.TRADING_DAYS, DEFAULTS.tradingDays, "TRADING_DAYS"),
    dexieDbName: process.env.DEXIE_DB_NAME || DEFAULTS.dexieDbName,
    dexieDbVersion: parseIntOrDefault(
      process.env.DEXIE_DB_VERSION,
      DEFAULTS.dexieDbVersion,
      "DEXIE_DB_VERSION"
    ),
    retentionDays: parseIntOrDefault(
      process.env.RETENTION_DAYS,
      DEFAULTS.retentionDays,
      "RETENTION_DAYS"
    ),
    topSwingCount: parseIntOrDefault(
      process.env.TOP_SWING_COUNT,
      DEFAULTS.topSwingCount,
      "TOP_SWING_COUNT"
    ),
    logRetentionDays: DEFAULTS.logRetentionDays,
    navigationReadySelector:
      process.env.NAVIGATION_READY_SELECTOR || DEFAULTS.navigationReadySelector,
    navigationWaitTimeoutMs: parseIntOrDefault(
      process.env.NAVIGATION_WAIT_TIMEOUT_MS,
      DEFAULTS.navigationWaitTimeoutMs,
      "NAVIGATION_WAIT_TIMEOUT_MS"
    ),
    navigationPollIntervalMs: parseIntOrDefault(
      process.env.NAVIGATION_POLL_INTERVAL_MS,
      DEFAULTS.navigationPollIntervalMs,
      "NAVIGATION_POLL_INTERVAL_MS"
    ),
    navigationRetryLimit: parseIntOrDefault(
      process.env.NAVIGATION_RETRY_LIMIT,
      DEFAULTS.navigationRetryLimit,
      "NAVIGATION_RETRY_LIMIT"
    ),
    parsingSelectors: parseJsonOrDefault(
      process.env.PARSING_SELECTORS,
      DEFAULTS.parsingSelectors,
      "PARSING_SELECTORS"
    ),
    extensionSrcDir: process.env.EXTENSION_SRC_DIR || DEFAULTS.extensionSrcDir,
    extensionDistDir: process.env.EXTENSION_DIST_DIR || DEFAULTS.extensionDistDir,
  };
}

/**
 * Emit the runtime-config module consumed by the extension.
 *
 * @param {object} config - Build configuration source.
 * @param {string} destination - Output path for runtime-config module.
 */
function writeRuntimeConfig(
  config,
  destination = path.resolve(__dirname, "../extension/runtime-config.js")
) {
  // Normalize runtime configuration to keep extension settings deterministic.
  const runtimeConfig = {
    MARKET_TIMEZONE: config.marketTimezone,
    MARKET_OPEN: config.marketLockStartTime,
    MARKET_CLOSE: config.marketLockEndTime,
    ANALYSIS_DEADLINE: config.analysisDeadline,
    TRADING_DAYS: config.tradingDays,
    RETENTION_DAYS: config.retentionDays,
    TOP_SWING_COUNT: config.topSwingCount,
    SYMBOL_URL_TEMPLATE: config.symbolUrlTemplate,
    NAVIGATION_READY_SELECTOR: config.navigationReadySelector,
    NAVIGATION_WAIT_TIMEOUT_MS: config.navigationWaitTimeoutMs,
    NAVIGATION_POLL_INTERVAL_MS: config.navigationPollIntervalMs,
    NAVIGATION_RETRY_LIMIT: config.navigationRetryLimit,
    PARSING_SELECTORS: config.parsingSelectors || undefined,
    LOG_RETENTION_DAYS: config.logRetentionDays || DEFAULTS.logRetentionDays,
  };

  const contents =
    `export const LOG_LEVELS = ${JSON.stringify(
      ["error", "warning", "info", "debug"],
      null,
      2
    )};\n` +
    `export const DEFAULT_RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n` +
    `let STORED_RUNTIME_CONFIG = {};\n` +
    `export function setStoredRuntimeConfig(overrides = {}) { STORED_RUNTIME_CONFIG = { ...overrides }; }\n` +
    `export function getStoredRuntimeConfig() { return { ...STORED_RUNTIME_CONFIG }; }\n` +
    `export function getRuntimeConfig(overrides = {}) { const base = { ...DEFAULT_RUNTIME_CONFIG, ...STORED_RUNTIME_CONFIG, ...overrides }; return { ...base, LOG_RETENTION_DAYS: { ...DEFAULT_RUNTIME_CONFIG.LOG_RETENTION_DAYS, ...(STORED_RUNTIME_CONFIG.LOG_RETENTION_DAYS || {}), ...(overrides.LOG_RETENTION_DAYS || {}) } }; }\n`;
  fs.writeFileSync(destination, contents);
}

module.exports = { loadEnvConfig, writeRuntimeConfig, DEFAULTS };
