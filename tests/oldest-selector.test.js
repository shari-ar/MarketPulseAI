const assert = require("assert");
const { describe, it } = require("node:test");

describe("oldest-first ticker selection", () => {
  const sampleRecords = [
    { id: "AAA", dateTime: "2024-02-01T00:00:00Z" },
    { id: "BBB", dateTime: "2024-01-01T00:00:00Z" },
    { id: "AAA", dateTime: "2024-03-01T00:00:00Z" },
    { id: "CCC" },
    { id: "DDD", dateTime: "2024-01-05T00:00:00Z" },
    { id: "EEE", dateTime: "2024-01-07T00:00:00Z" },
  ];

  it("picks a deterministic ticker from the 10 oldest symbols", async () => {
    const { selectTickerFromOldest } = await import("../extension/storage/selection.js");

    const pick = selectTickerFromOldest(sampleRecords, {
      sampleSize: 5,
      seed: "deterministic-seed",
    });

    assert.deepStrictEqual(pick, { id: "BBB", dateTime: "2024-01-01T00:00:00Z" });
  });

  it("yields the same result with the same seed and different with another", async () => {
    const { selectTickerFromOldest } = await import("../extension/storage/selection.js");

    const first = selectTickerFromOldest(sampleRecords, {
      sampleSize: 3,
      seed: "repeatable",
    });
    const second = selectTickerFromOldest(sampleRecords, {
      sampleSize: 3,
      seed: "repeatable",
    });
    const alternative = selectTickerFromOldest(sampleRecords, {
      sampleSize: 3,
      seed: "alternate",
    });

    assert.deepStrictEqual(first, second);
    assert.notDeepStrictEqual(first, alternative);
  });

  it("returns null when there are no ticker candidates", async () => {
    const { selectTickerFromOldest } = await import("../extension/storage/selection.js");

    const pick = selectTickerFromOldest([], { seed: "empty" });
    assert.strictEqual(pick, null);
  });

  it("handles missing record lists without throwing", async () => {
    const { selectTickerFromOldest } = await import("../extension/storage/selection.js");

    const pick = selectTickerFromOldest(undefined, { seed: "missing" });
    assert.strictEqual(pick, null);
  });
});
