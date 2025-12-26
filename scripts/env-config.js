const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

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

function parseIntOrDefault(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseJsonOrDefault(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function loadEnvConfig() {
  const projectRoot = path.resolve(__dirname, "..");
  dotenv.config({ path: path.join(projectRoot, ".env") });

  return {
    tsetmcBaseUrl: process.env.TSETMC_BASE_URL || DEFAULTS.tsetmcBaseUrl,
    symbolUrlTemplate: process.env.SYMBOL_URL_TEMPLATE || DEFAULTS.symbolUrlTemplate,
    marketLockStartTime: process.env.MARKET_LOCK_START_TIME || DEFAULTS.marketLockStartTime,
    marketLockEndTime: process.env.MARKET_LOCK_END_TIME || DEFAULTS.marketLockEndTime,
    analysisDeadline: process.env.ANALYSIS_DEADLINE || DEFAULTS.analysisDeadline,
    marketTimezone: process.env.MARKET_TIMEZONE || DEFAULTS.marketTimezone,
    tradingDays: parseJsonOrDefault(process.env.TRADING_DAYS, DEFAULTS.tradingDays),
    dexieDbName: process.env.DEXIE_DB_NAME || DEFAULTS.dexieDbName,
    dexieDbVersion: parseIntOrDefault(process.env.DEXIE_DB_VERSION, DEFAULTS.dexieDbVersion),
    retentionDays: parseIntOrDefault(process.env.RETENTION_DAYS, DEFAULTS.retentionDays),
    topSwingCount: parseIntOrDefault(process.env.TOP_SWING_COUNT, DEFAULTS.topSwingCount),
    logRetentionDays: DEFAULTS.logRetentionDays,
    navigationReadySelector:
      process.env.NAVIGATION_READY_SELECTOR || DEFAULTS.navigationReadySelector,
    navigationWaitTimeoutMs: parseIntOrDefault(
      process.env.NAVIGATION_WAIT_TIMEOUT_MS,
      DEFAULTS.navigationWaitTimeoutMs
    ),
    navigationPollIntervalMs: parseIntOrDefault(
      process.env.NAVIGATION_POLL_INTERVAL_MS,
      DEFAULTS.navigationPollIntervalMs
    ),
    navigationRetryLimit: parseIntOrDefault(
      process.env.NAVIGATION_RETRY_LIMIT,
      DEFAULTS.navigationRetryLimit
    ),
    parsingSelectors: parseJsonOrDefault(process.env.PARSING_SELECTORS, DEFAULTS.parsingSelectors),
    extensionSrcDir: process.env.EXTENSION_SRC_DIR || DEFAULTS.extensionSrcDir,
    extensionDistDir: process.env.EXTENSION_DIST_DIR || DEFAULTS.extensionDistDir,
  };
}

function writeRuntimeConfig(
  config,
  destination = path.resolve(__dirname, "../extension/runtime-config.js")
) {
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
    `export const DEFAULT_RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n` +
    `export function getRuntimeConfig(overrides = {}) { return { ...DEFAULT_RUNTIME_CONFIG, ...overrides, LOG_RETENTION_DAYS: { ...DEFAULT_RUNTIME_CONFIG.LOG_RETENTION_DAYS, ...(overrides.LOG_RETENTION_DAYS || {}) } }; }\n`;
  fs.writeFileSync(destination, contents);
}

module.exports = { loadEnvConfig, writeRuntimeConfig, DEFAULTS };
