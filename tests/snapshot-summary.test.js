const assert = require("assert");
const { describe, it } = require("node:test");

describe("summarizeRecords", () => {
  it("returns counts and most recent records sorted by collectedAt", async () => {
    const { summarizeRecords } = await import("../extension/storage/snapshots.js");

    const summary = summarizeRecords(
      [
        { symbol: "AAA", tradeDate: "2024-03-01", close: 101, collectedAt: "2024-03-01T13:30:00Z" },
        { symbol: "BBB", tradeDate: "2024-03-02", close: 202, collectedAt: "2024-03-02T13:30:00Z" },
        { symbol: "AAA", tradeDate: "2024-03-03", close: 103, collectedAt: "2024-03-03T13:30:00Z" },
      ],
      { recentLimit: 2 }
    );

    assert.strictEqual(summary.totalRecords, 3);
    assert.strictEqual(summary.distinctSymbols, 2);
    assert.strictEqual(summary.mostRecent.length, 2);
    assert.strictEqual(summary.mostRecent[0].tradeDate, "2024-03-03");
    assert.strictEqual(summary.mostRecent[1].tradeDate, "2024-03-02");
  });

  it("ignores records missing a symbol or tradeDate", async () => {
    const { summarizeRecords } = await import("../extension/storage/snapshots.js");

    const summary = summarizeRecords([
      { symbol: "AAA", tradeDate: "2024-03-01", close: 101 },
      { symbol: "", tradeDate: "2024-03-02", close: 202 },
      { symbol: "BBB", tradeDate: null, close: 303 },
    ]);

    assert.strictEqual(summary.totalRecords, 1);
    assert.strictEqual(summary.distinctSymbols, 1);
    assert.strictEqual(summary.mostRecent[0].symbol, "AAA");
  });

  it("handles invalid timestamps by falling back to tradeDate ordering", async () => {
    const { summarizeRecords } = await import("../extension/storage/snapshots.js");

    const summary = summarizeRecords(
      [
        { symbol: "AAA", tradeDate: "2024-03-02", collectedAt: "invalid" },
        { symbol: "BBB", tradeDate: "2024-03-03", collectedAt: "invalid" },
      ],
      { recentLimit: 5 }
    );

    assert.strictEqual(summary.mostRecent[0].symbol, "BBB");
    assert.strictEqual(summary.mostRecent[1].symbol, "AAA");
  });
});

describe("latestRecordsBySymbol", () => {
  it("keeps the newest record per symbol using collectedAt first", async () => {
    const { latestRecordsBySymbol } = await import("../extension/storage/snapshots.js");

    const latest = latestRecordsBySymbol([
      { symbol: "AAA", tradeDate: "2024-03-01", collectedAt: "2024-03-01T13:30:00Z" },
      { symbol: "BBB", tradeDate: "2024-03-01", collectedAt: "2024-03-02T13:30:00Z" },
      { symbol: "AAA", tradeDate: "2024-03-02", collectedAt: "2024-03-02T13:30:00Z" },
      { symbol: "BBB", tradeDate: "2024-02-28", collectedAt: "2024-02-28T13:30:00Z" },
    ]);

    assert.deepStrictEqual(
      latest.map((record) => ({ symbol: record.symbol, tradeDate: record.tradeDate })),
      [
        { symbol: "AAA", tradeDate: "2024-03-02" },
        { symbol: "BBB", tradeDate: "2024-03-01" },
      ]
    );
  });

  it("falls back to tradeDate ordering when collectedAt is missing or invalid", async () => {
    const { latestRecordsBySymbol } = await import("../extension/storage/snapshots.js");

    const latest = latestRecordsBySymbol([
      { symbol: "CCC", tradeDate: "2024-03-05", collectedAt: "invalid" },
      { symbol: "CCC", tradeDate: "2024-03-06" },
      { symbol: "DDD", tradeDate: "2024-03-04", collectedAt: null },
      { symbol: "DDD", tradeDate: "2024-03-05", collectedAt: null },
    ]);

    assert.deepStrictEqual(
      latest.map((record) => ({ symbol: record.symbol, tradeDate: record.tradeDate })),
      [
        { symbol: "CCC", tradeDate: "2024-03-06" },
        { symbol: "DDD", tradeDate: "2024-03-05" },
      ]
    );
  });
});
