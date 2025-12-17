const assert = require("assert");
const { describe, it } = require("node:test");

describe("swing ranking", () => {
  it("sorts by probability then swing percent and returns top five", async () => {
    const { rankSwingResults } = await import("../extension/analysis/rank.js");

    const ranked = rankSwingResults([
      { id: "AAA", predictedSwingProbability: 0.62, predictedSwingPercent: 3.1 },
      { id: "BBB", predictedSwingProbability: 0.82, predictedSwingPercent: 1.5 },
      { id: "CCC", predictedSwingProbability: 0.82, predictedSwingPercent: 4.2 },
      { id: "DDD", predictedSwingProbability: 0.15, predictedSwingPercent: -1.2 },
      { id: "EEE", predictedSwingProbability: 0.4, predictedSwingPercent: 0.2 },
      { id: "FFF", predictedSwingProbability: 0.21, predictedSwingPercent: 7.2 },
    ]);

    assert.strictEqual(ranked.length, 5);
    assert.deepStrictEqual(
      ranked.map((r) => r.id),
      ["CCC", "BBB", "AAA", "EEE", "FFF"]
    );
  });
});
