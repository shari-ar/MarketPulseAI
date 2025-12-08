const assert = require("assert");
const { describe, it } = require("node:test");

describe("rankSwingResults", () => {
  it("sorts by descending probability with symbol tie-breaker", async () => {
    const { rankSwingResults } = await import("../extension/analysis/rank.js");

    const ranked = rankSwingResults({
      probabilities: [0.42, 0.9, 0.9, 0.13],
      rawEntries: [{ symbol: "ZAGN" }, { symbol: "BAMA" }, { symbol: "ARAZ" }, { symbol: "DENA" }],
      normalizedInputs: [
        { open: 0.1, high: 0.2, low: 0.05, close: 0.15 },
        { open: 0.2, high: 0.4, low: 0.1, close: 0.3 },
        { open: 0.3, high: 0.6, low: 0.2, close: 0.5 },
        { open: 0.4, high: 0.7, low: 0.3, close: 0.55 },
      ],
    });

    assert.deepStrictEqual(ranked, [
      {
        probability: 0.9,
        symbol: "ARAZ",
        normalized: { open: 0.3, high: 0.6, low: 0.2, close: 0.5 },
      },
      {
        probability: 0.9,
        symbol: "BAMA",
        normalized: { open: 0.2, high: 0.4, low: 0.1, close: 0.3 },
      },
      {
        probability: 0.42,
        symbol: "ZAGN",
        normalized: { open: 0.1, high: 0.2, low: 0.05, close: 0.15 },
      },
      {
        probability: 0.13,
        symbol: "DENA",
        normalized: { open: 0.4, high: 0.7, low: 0.3, close: 0.55 },
      },
    ]);
  });

  it("falls back to original index ordering when ties have no symbols", async () => {
    const { rankSwingResults } = await import("../extension/analysis/rank.js");

    const ranked = rankSwingResults({ probabilities: [0.5, 0.5, 0.7, 0.5] });

    assert.deepStrictEqual(ranked, [
      { probability: 0.7, symbol: undefined, normalized: undefined },
      { probability: 0.5, symbol: undefined, normalized: undefined },
      { probability: 0.5, symbol: undefined, normalized: undefined },
      { probability: 0.5, symbol: undefined, normalized: undefined },
    ]);
  });
});
