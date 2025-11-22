const { test, beforeEach, afterEach } = require("node:test");
const assert = require("assert");

const { loadEnvConfig, DEFAULTS } = require("../scripts/env-config");

const ENV_KEYS = [
  "TSETMC_BASE_URL",
  "MARKET_CLOSE_TIME",
  "MARKET_TIMEZONE",
  "DEXIE_DB_NAME",
  "DEXIE_DB_VERSION",
  "EXTENSION_SRC_DIR",
  "EXTENSION_DIST_DIR",
];

beforeEach(() => {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
});

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
});

test("returns defaults when no env values are provided", () => {
  const config = loadEnvConfig();

  assert.deepStrictEqual(config, DEFAULTS);
});

test("allows overriding directories and URLs via environment variables", () => {
  const overrides = {
    TSETMC_BASE_URL: "https://example.com",
    MARKET_CLOSE_TIME: "14:30",
    MARKET_TIMEZONE: "UTC",
    DEXIE_DB_NAME: "customdb",
    DEXIE_DB_VERSION: "3",
    EXTENSION_SRC_DIR: "src/extension",
    EXTENSION_DIST_DIR: "out/extension",
  };

  Object.entries(overrides).forEach(([key, value]) => {
    process.env[key] = value;
  });

  const config = loadEnvConfig();

  assert.deepStrictEqual(config, {
    tsetmcBaseUrl: overrides.TSETMC_BASE_URL,
    marketCloseTime: overrides.MARKET_CLOSE_TIME,
    marketTimezone: overrides.MARKET_TIMEZONE,
    dexieDbName: overrides.DEXIE_DB_NAME,
    dexieDbVersion: overrides.DEXIE_DB_VERSION,
    extensionSrcDir: overrides.EXTENSION_SRC_DIR,
    extensionDistDir: overrides.EXTENSION_DIST_DIR,
  });
});
