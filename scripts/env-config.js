const path = require("path");
const dotenv = require("dotenv");

const DEFAULTS = {
  tsetmcBaseUrl: "https://www.tsetmc.com",
  marketCloseTime: "08:00",
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
    marketCloseTime: process.env.MARKET_CLOSE_TIME || DEFAULTS.marketCloseTime,
    marketTimezone: process.env.MARKET_TIMEZONE || DEFAULTS.marketTimezone,
    dexieDbName: process.env.DEXIE_DB_NAME || DEFAULTS.dexieDbName,
    dexieDbVersion: parseIntOrDefault(process.env.DEXIE_DB_VERSION, DEFAULTS.dexieDbVersion),
    extensionSrcDir: process.env.EXTENSION_SRC_DIR || DEFAULTS.extensionSrcDir,
    extensionDistDir: process.env.EXTENSION_DIST_DIR || DEFAULTS.extensionDistDir,
  };
}

module.exports = { loadEnvConfig, DEFAULTS };
