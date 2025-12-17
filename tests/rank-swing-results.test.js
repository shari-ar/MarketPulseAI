const assert = require("assert");
const { describe, it } = require("node:test");

describe("rankSwingResults", () => {
  it("sorts by probability then swing percent", async () => {
    const { rankSwingResults } = await import("../extension/analysis/rank.js");

    const ranked = rankSwingResults({
      predictions: [
        { predictedSwingProbability: 0.42, predictedSwingPercent: 1.1 },
        { predictedSwingProbability: 0.9, predictedSwingPercent: 1.2 },
        { predictedSwingProbability: 0.9, predictedSwingPercent: 0.8 },
        { predictedSwingProbability: 0.13, predictedSwingPercent: 2.5 },
      ],
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
        swingPercent: 1.2,
        symbol: "BAMA",
        normalized: { open: 0.2, high: 0.4, low: 0.1, close: 0.3 },
      },
      {
        probability: 0.9,
        swingPercent: 0.8,
        symbol: "ARAZ",
        normalized: { open: 0.3, high: 0.6, low: 0.2, close: 0.5 },
      },
      {
        probability: 0.42,
        swingPercent: 1.1,
        symbol: "ZAGN",
        normalized: { open: 0.1, high: 0.2, low: 0.05, close: 0.15 },
      },
      {
        probability: 0.13,
        swingPercent: 2.5,
        symbol: "DENA",
        normalized: { open: 0.4, high: 0.7, low: 0.3, close: 0.55 },
      },
    ]);
  });

  it("falls back to original index ordering when ties have no symbols", async () => {
    const { rankSwingResults } = await import("../extension/analysis/rank.js");

    const ranked = rankSwingResults({
      predictions: [
        { predictedSwingProbability: 0.5, predictedSwingPercent: 0.1 },
        { predictedSwingProbability: 0.5, predictedSwingPercent: 0.1 },
        { predictedSwingProbability: 0.7, predictedSwingPercent: 0.2 },
        { predictedSwingProbability: 0.5, predictedSwingPercent: 0.1 },
      ],
    });

    assert.deepStrictEqual(ranked, [
      { probability: 0.7, swingPercent: 0.2, symbol: undefined, normalized: undefined },
      { probability: 0.5, swingPercent: 0.1, symbol: undefined, normalized: undefined },
      { probability: 0.5, swingPercent: 0.1, symbol: undefined, normalized: undefined },
      { probability: 0.5, swingPercent: 0.1, symbol: undefined, normalized: undefined },
    ]);
  });
});
