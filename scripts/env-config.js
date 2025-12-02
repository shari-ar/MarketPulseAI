const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const DEFAULTS = {
  tsetmcBaseUrl: "https://www.tsetmc.com",
  marketLockStartTime: "08:00",
  marketLockEndTime: "13:00",
  marketTimezone: "Asia/Tehran",
  dexieDbName: "marketpulseai",
  dexieDbVersion: 2,
  extensionSrcDir: "extension",
  extensionDistDir: "dist/extension",
};

function parseIntOrDefault(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function loadEnvConfig() {
  const projectRoot = path.resolve(__dirname, "..");
  dotenv.config({ path: path.join(projectRoot, ".env") });

  return {
    tsetmcBaseUrl: process.env.TSETMC_BASE_URL || DEFAULTS.tsetmcBaseUrl,
    marketLockStartTime: process.env.MARKET_LOCK_START_TIME || DEFAULTS.marketLockStartTime,
    marketLockEndTime: process.env.MARKET_LOCK_END_TIME || DEFAULTS.marketLockEndTime,
    marketTimezone: process.env.MARKET_TIMEZONE || DEFAULTS.marketTimezone,
    dexieDbName: process.env.DEXIE_DB_NAME || DEFAULTS.dexieDbName,
    dexieDbVersion: parseIntOrDefault(process.env.DEXIE_DB_VERSION, DEFAULTS.dexieDbVersion),
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
    MARKET_LOCK_START_TIME: config.marketLockStartTime,
    MARKET_LOCK_END_TIME: config.marketLockEndTime,
  };

  const contents = `export const RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`;
  fs.writeFileSync(destination, contents);
}

module.exports = { loadEnvConfig, writeRuntimeConfig, DEFAULTS };
