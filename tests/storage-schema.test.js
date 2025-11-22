const assert = require("assert");
const { describe, it } = require("node:test");

describe("Dexie schema", () => {
  it("defines a stable OHLC table shape", async () => {
    const schema = await import("../extension/storage/schema.js");

    assert.strictEqual(schema.DB_NAME, "marketpulseai");
    const versions = Object.keys(schema.SCHEMA_MIGRATIONS).map(Number);

    assert.strictEqual(schema.DB_VERSION, Math.max(...versions));
    assert.strictEqual(schema.OHLC_TABLE, "ohlcRecords");
    assert.deepStrictEqual(Object.keys(schema.OHLC_RECORD_FIELDS), [
      "symbol",
      "tradeDate",
      "open",
      "high",
      "low",
      "close",
      "volume",
      "collectedAt",
    ]);
  });

  it("configures sequential migrations", async () => {
    const schema = await import("../extension/storage/schema.js");

    const versions = Object.keys(schema.SCHEMA_MIGRATIONS).map(Number);
    assert.deepStrictEqual(versions, [1, 2]);

    const latest = schema.SCHEMA_MIGRATIONS[2];
    assert.ok(latest.stores[schema.OHLC_TABLE].includes("collectedAt"));
    assert.strictEqual(typeof latest.upgrade, "function");
  });
});
