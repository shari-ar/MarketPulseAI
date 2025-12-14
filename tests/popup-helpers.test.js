import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectSymbolFromUrl, pickLatestBySymbol } from "../extension/popup-helpers.js";

describe("detectSymbolFromUrl", () => {
  it("extracts symbol from InstInfo path", () => {
    assert.equal(detectSymbolFromUrl("https://www.tsetmc.com/InstInfo/ABC123"), "ABC123");
  });

  it("extracts symbol when InstInfo path has nested routes", () => {
    const url = "https://www.tsetmc.com/instInfo/ABC123/depth/orders?tab=details#metrics";
    assert.equal(detectSymbolFromUrl(url), "ABC123");
  });

  it("returns null when no symbol present", () => {
    assert.equal(detectSymbolFromUrl("https://www.example.com"), null);
  });
});

describe("pickLatestBySymbol", () => {
  it("keeps the newest record per symbol by dateTime", () => {
    const records = [
      { id: "AAA", dateTime: "2024-08-01T10:00:00Z", primeCost: 1 },
      { id: "AAA", dateTime: "2024-08-01T11:00:00Z", primeCost: 2 },
      { id: "BBB", dateTime: "2024-08-01T09:00:00Z", primeCost: 3 },
    ];

    const latest = pickLatestBySymbol(records);
    assert.equal(latest.length, 2);
    const aaa = latest.find((r) => r.id === "AAA");
    assert.equal(aaa.primeCost, 2);
  });

  it("ignores entries without a symbol", () => {
    const latest = pickLatestBySymbol([{ id: null, dateTime: "2024-01-01" }]);
    assert.equal(latest.length, 0);
  });
});
