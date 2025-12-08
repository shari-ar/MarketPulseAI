const assert = require("assert");
const { describe, it } = require("node:test");

describe("Dexie schema", () => {
  it("defines the TopBox snapshot table shape", async () => {
    const schema = await import("../extension/storage/schema.js");

    assert.strictEqual(schema.DB_NAME, "marketpulseai");
    const versions = Object.keys(schema.SCHEMA_MIGRATIONS).map(Number);

    assert.strictEqual(schema.DB_VERSION, Math.max(...versions));
    assert.strictEqual(schema.SNAPSHOT_TABLE, "topBoxSnapshots");
    assert.strictEqual(schema.ANALYSIS_CACHE_TABLE, "analysisCache");
    assert.deepStrictEqual(Object.keys(schema.SNAPSHOT_FIELDS), [
      "id",
      "dateTime",
      "symbolName",
      "symbolAbbreviation",
      "lastTrade",
      "closingPrice",
      "firstPrice",
      "tradesCount",
      "tradingVolume",
      "tradingValue",
      "marketValue",
      "lastPriceTime",
      "status",
      "dailyLowRange",
      "dailyHighRange",
      "allowedLowPrice",
      "allowedHighPrice",
      "shareCount",
      "baseVolume",
      "floatingShares",
      "averageMonthlyVolume",
      "realBuyVolume",
      "realSellVolume",
      "legalBuyVolume",
      "legalSellVolume",
      "totalBuyVolume",
      "totalSellVolume",
      "realBuyCount",
      "realSellCount",
      "legalBuyCount",
      "legalSellCount",
      "totalBuyCount",
      "totalSellCount",
    ]);

    assert.deepStrictEqual(Object.keys(schema.ANALYSIS_CACHE_FIELDS), ["symbol", "lastAnalyzedAt"]);
  });

  it("configures sequential migrations", async () => {
    const schema = await import("../extension/storage/schema.js");

    const versions = Object.keys(schema.SCHEMA_MIGRATIONS).map(Number);
    assert.deepStrictEqual(versions, [1, 2, 3, 4]);

    const latest = schema.SCHEMA_MIGRATIONS[4];
    assert.ok(latest.stores[schema.SNAPSHOT_TABLE].includes("dateTime"));
    assert.ok(latest.stores[schema.ANALYSIS_CACHE_TABLE].includes("lastAnalyzedAt"));
  });
});
