const { test, beforeEach, afterEach } = require("node:test");
const assert = require("assert");

const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadEnvConfig, DEFAULTS, writeRuntimeConfig } = require("../scripts/env-config");

const ENV_KEYS = [
  "TSETMC_BASE_URL",
  "MARKET_LOCK_START_TIME",
  "MARKET_LOCK_END_TIME",
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
    MARKET_LOCK_START_TIME: "08:30",
    MARKET_LOCK_END_TIME: "13:30",
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
    marketLockStartTime: overrides.MARKET_LOCK_START_TIME,
    marketLockEndTime: overrides.MARKET_LOCK_END_TIME,
    marketTimezone: overrides.MARKET_TIMEZONE,
    dexieDbName: overrides.DEXIE_DB_NAME,
    dexieDbVersion: Number.parseInt(overrides.DEXIE_DB_VERSION, 10),
    extensionSrcDir: overrides.EXTENSION_SRC_DIR,
    extensionDistDir: overrides.EXTENSION_DIST_DIR,
  });
});

test("writes runtime config using resolved environment values", () => {
  const overrides = {
    MARKET_LOCK_START_TIME: "09:00",
    MARKET_LOCK_END_TIME: "12:45",
    MARKET_TIMEZONE: "UTC",
  };

  Object.entries(overrides).forEach(([key, value]) => {
    process.env[key] = value;
  });

  const config = loadEnvConfig();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-"));
  const outputPath = path.join(tempDir, "runtime-config.js");
  writeRuntimeConfig(config, outputPath);

  const contents = fs.readFileSync(outputPath, "utf8");

  assert.match(contents, /"MARKET_LOCK_START_TIME": "09:00"/);
  assert.match(contents, /"MARKET_LOCK_END_TIME": "12:45"/);
  assert.match(contents, /"MARKET_TIMEZONE": "UTC"/);
});
