const assert = require("assert");
const { describe, it } = require("node:test");

describe("logging configuration", () => {
  it("exposes per-level retention defaults including debug", async () => {
    const { DEFAULT_RUNTIME_CONFIG } = await import("../extension/runtime-config.js");

    assert.deepStrictEqual(DEFAULT_RUNTIME_CONFIG.LOG_RETENTION_DAYS, {
      error: 30,
      warning: 7,
      info: 3,
      debug: 1,
    });
  });

  it("applies retention TTL to debug logs", async () => {
    const { LoggingService } = await import("../extension/background/logger.js");
    const { DEFAULT_RUNTIME_CONFIG } = await import("../extension/runtime-config.js");

    const logger = new LoggingService({ config: DEFAULT_RUNTIME_CONFIG, storage: null });
    const now = new Date("2024-01-01T00:00:00Z");
    const entry = logger.log({ type: "debug", message: "retention check", now });

    const expectedExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(entry.expiresAt, expectedExpiry);
  });
});
