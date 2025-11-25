import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectSymbolFromUrl, pickLatestBySymbol } from "../extension/popup-helpers.js";

describe("detectSymbolFromUrl", () => {
  it("extracts symbol from InstInfo path", () => {
    assert.equal(detectSymbolFromUrl("https://www.tsetmc.com/InstInfo/ABC123"), "ABC123");
  });

  it("returns null when no symbol present", () => {
    assert.equal(detectSymbolFromUrl("https://www.example.com"), null);
  });
});

describe("pickLatestBySymbol", () => {
  it("keeps the newest record per symbol by collectedAt", () => {
    const records = [
      { symbol: "AAA", collectedAt: "2024-08-01T10:00:00Z", close: 1 },
      { symbol: "AAA", collectedAt: "2024-08-01T11:00:00Z", close: 2 },
      { symbol: "BBB", collectedAt: "2024-08-01T09:00:00Z", close: 3 },
    ];

    const latest = pickLatestBySymbol(records);
    assert.equal(latest.length, 2);
    const aaa = latest.find((r) => r.symbol === "AAA");
    assert.equal(aaa.close, 2);
  });

  it("ignores entries without a symbol", () => {
    const latest = pickLatestBySymbol([{ symbol: null, collectedAt: "2024-01-01" }]);
    assert.equal(latest.length, 0);
  });
});
