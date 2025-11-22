const path = require("path");
const dotenv = require("dotenv");

const DEFAULTS = {
  tsetmcBaseUrl: "https://www.tsetmc.com",
  marketCloseTime: "13:00",
  marketTimezone: "Asia/Tehran",
  dexieDbName: "marketpulseai",
  dexieDbVersion: "1",
  extensionSrcDir: "extension",
  extensionDistDir: "dist/extension",
};

function loadEnvConfig() {
  const projectRoot = path.resolve(__dirname, "..");
  dotenv.config({ path: path.join(projectRoot, ".env") });

  return {
    tsetmcBaseUrl: process.env.TSETMC_BASE_URL || DEFAULTS.tsetmcBaseUrl,
    marketCloseTime: process.env.MARKET_CLOSE_TIME || DEFAULTS.marketCloseTime,
    marketTimezone: process.env.MARKET_TIMEZONE || DEFAULTS.marketTimezone,
    dexieDbName: process.env.DEXIE_DB_NAME || DEFAULTS.dexieDbName,
    dexieDbVersion: process.env.DEXIE_DB_VERSION || DEFAULTS.dexieDbVersion,
    extensionSrcDir: process.env.EXTENSION_SRC_DIR || DEFAULTS.extensionSrcDir,
    extensionDistDir: process.env.EXTENSION_DIST_DIR || DEFAULTS.extensionDistDir,
  };
}

module.exports = { loadEnvConfig, DEFAULTS };
