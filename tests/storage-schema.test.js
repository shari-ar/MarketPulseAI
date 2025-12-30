const assert = require("assert");
const { describe, it } = require("node:test");

describe("storage schema", () => {
  it("matches documented tables and keys", async () => {
    const schema = await import("../extension/storage/schema.js");

    assert.strictEqual(schema.DB_NAME, "marketpulseai");
    assert.strictEqual(schema.DB_VERSION, 1);
    assert.strictEqual(schema.SNAPSHOT_TABLE, "stocks");
    assert.strictEqual(schema.ANALYSIS_CACHE_TABLE, "analysisCache");
    assert.strictEqual(schema.LOG_TABLE, "logs");

    const snapshotKeys = Object.keys(schema.SNAPSHOT_FIELDS);
    assert.ok(snapshotKeys.includes("predictedSwingPercent"));
    assert.ok(snapshotKeys.includes("predictedSwingProbability"));

    assert.deepStrictEqual(Object.keys(schema.ANALYSIS_CACHE_FIELDS), ["symbol", "lastAnalyzedAt"]);
    assert.deepStrictEqual(Object.keys(schema.LOG_FIELDS), [
      "id",
      "type",
      "message",
      "context",
      "source",
      "createdAt",
      "expiresAt",
      "pageUrl",
    ]);

    const definition = schema.getSchemaDefinition();
    assert.ok(definition.stocks.includes("[id+dateTime]"));
    assert.ok(definition.analysisCache.includes("symbol"));
    assert.ok(definition.logs.includes("++id"));
  });
});
