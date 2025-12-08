const assert = require("assert");
const { describe, it } = require("node:test");

describe("normalizePriceArrays", () => {
  it("scales prices by the max absolute value while preserving structure", async () => {
    const { normalizePriceArrays } = await import("../extension/analysis/normalize.js");

    const result = normalizePriceArrays([
      { open: 100, high: 120, low: 90, close: 110 },
      { open: 95, high: 100, low: 80, close: 85 },
    ]);

    assert.deepStrictEqual(result, [
      { open: 0.833333, high: 1, low: 0.75, close: 0.916667 },
      { open: 0.791667, high: 0.833333, low: 0.666667, close: 0.708333 },
    ]);
  });

  it("accepts array inputs and coerces numeric strings", async () => {
    const { normalizePriceArrays } = await import("../extension/analysis/normalize.js");

    const result = normalizePriceArrays([
      ["10.5", "12", "10", "11.5"],
      [9, 12, 8, 10],
    ]);

    assert.deepStrictEqual(result, [
      { open: 0.875, high: 1, low: 0.833333, close: 0.958333 },
      { open: 0.75, high: 1, low: 0.666667, close: 0.833333 },
    ]);
  });

  it("returns zeros when every value is zero", async () => {
    const { normalizePriceArrays } = await import("../extension/analysis/normalize.js");

    const result = normalizePriceArrays([{ open: 0, high: 0, low: 0, close: 0 }, [0, 0, 0, 0]]);

    assert.deepStrictEqual(result, [
      { open: 0, high: 0, low: 0, close: 0 },
      { open: 0, high: 0, low: 0, close: 0 },
    ]);
  });

  it("throws for malformed price entries", async () => {
    const { normalizePriceArrays } = await import("../extension/analysis/normalize.js");

    assert.throws(() => normalizePriceArrays([{ open: 10, high: 9, low: 12, close: 9 }]));
    assert.throws(() => normalizePriceArrays([[1, 2, 3]]));
    assert.throws(() => normalizePriceArrays(["not-an-array"]));
  });
});
