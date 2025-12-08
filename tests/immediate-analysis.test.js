const assert = require("assert");
const { describe, it } = require("node:test");

function createStubDb({ snapshots = [], cacheEntries = new Map() } = {}) {
  const snapshotTable = {
    toArray: async () => snapshots,
  };

  const cacheTable = {
    get: async (key) => cacheEntries.get(key) ?? null,
    put: async (entry) => {
      cacheEntries.set(entry.symbol, entry);
      return entry;
    },
  };

  return {
    open: async () => {},
    table(name) {
      if (name === "snapshots") return snapshotTable;
      if (name === "cache") return cacheTable;
      throw new Error(`Unknown table ${name}`);
    },
  };
}

describe("ImmediateAnalyzer", () => {
  it("runs analysis with the freshest snapshots immediately after storage", async () => {
    const { ImmediateAnalyzer } = await import("../extension/analysis/immediate-analyzer.js");

    const snapshots = [
      {
        id: "AAA",
        firstPrice: 9,
        dailyHighRange: 10,
        dailyLowRange: 8,
        closingPrice: 9.5,
        dateTime: "2024-01-02T00:00:00Z",
      },
      {
        id: "AAA",
        firstPrice: 7,
        dailyHighRange: 9,
        dailyLowRange: 6,
        closingPrice: 7.5,
        dateTime: "2024-01-01T00:00:00Z",
      },
    ];

    let received = null;
    const analyzer = new ImmediateAnalyzer({
      dbInstance: createStubDb({ snapshots }),
      snapshotTableName: "snapshots",
      analysisCacheTableName: "cache",
      analysisRunner: async (priceArrays) => {
        received = priceArrays;
        return { ranked: [] };
      },
    });

    await analyzer.trigger();

    assert.deepStrictEqual(received, [
      {
        symbol: "AAA",
        open: 9,
        high: 10,
        low: 8,
        close: 9.5,
        capturedAt: "2024-01-02T00:00:00Z",
      },
    ]);
  });

  it("skips analysis when cached results are newer than stored data", async () => {
    const { ImmediateAnalyzer } = await import("../extension/analysis/immediate-analyzer.js");

    const cacheEntries = new Map([
      ["AAA", { symbol: "AAA", lastAnalyzedAt: "2024-02-01T00:00:00Z" }],
    ]);

    let callCount = 0;
    const analyzer = new ImmediateAnalyzer({
      dbInstance: createStubDb({
        snapshots: [
          {
            id: "AAA",
            firstPrice: 9,
            dailyHighRange: 10,
            dailyLowRange: 8,
            closingPrice: 9.5,
            dateTime: "2024-01-02T00:00:00Z",
          },
        ],
        cacheEntries,
      }),
      snapshotTableName: "snapshots",
      analysisCacheTableName: "cache",
      analysisRunner: async () => {
        callCount += 1;
        return { ranked: [] };
      },
    });

    await analyzer.trigger();
    assert.strictEqual(callCount, 0);
  });

  it("coalesces overlapping triggers so analysis runs only once", async () => {
    const { ImmediateAnalyzer } = await import("../extension/analysis/immediate-analyzer.js");

    const cacheEntries = new Map();
    let callCount = 0;
    const analyzer = new ImmediateAnalyzer({
      dbInstance: createStubDb({
        snapshots: [
          {
            id: "AAA",
            firstPrice: 9,
            dailyHighRange: 10,
            dailyLowRange: 8,
            closingPrice: 9.5,
            dateTime: "2024-01-02T00:00:00Z",
          },
        ],
        cacheEntries,
      }),
      snapshotTableName: "snapshots",
      analysisCacheTableName: "cache",
      analysisRunner: async () => {
        callCount += 1;
        cacheEntries.set("AAA", { symbol: "AAA", lastAnalyzedAt: new Date().toISOString() });
        return { ranked: [] };
      },
    });

    await Promise.all([analyzer.trigger(), analyzer.trigger()]);
    assert.strictEqual(callCount, 1);
  });
});
