const assert = require("assert");
const { describe, it } = require("node:test");

describe("navigator service", () => {
  it("skips collection during blackout hours", async () => {
    const { NavigatorService } = await import("../extension/background/navigator.js");

    const navigator = new NavigatorService();
    const blackoutTime = new Date(Date.UTC(2024, 0, 1, 6, 0)); // 09:30 Tehran
    const result = navigator.recordSnapshots(
      [
        {
          id: "AAA",
          dateTime: blackoutTime.toISOString(),
          symbolName: "AAA",
          symbolAbbreviation: "AAA",
          predictedSwingPercent: 0,
          predictedSwingProbability: 0,
          close: 0,
          primeCost: 0,
          open: 0,
          tradesCount: 0,
          tradingVolume: 0,
          tradingValue: 0,
          marketValue: 0,
          closeTime: blackoutTime.toISOString(),
          status: "closed",
          low: 0,
          high: 0,
          allowedLow: 0,
          allowedHigh: 0,
          shareCount: 0,
          baseVolume: 0,
          floatingShares: 0,
          averageMonthlyVolume: 0,
          naturalBuyVolume: 0,
          naturalSellVolume: 0,
          juridicalBuyVolume: 0,
          juridicalSellVolume: 0,
          totalBuyVolume: 0,
          totalSellVolume: 0,
          naturalBuyCount: 0,
          naturalSellCount: 0,
          juridicalBuyCount: 0,
          juridicalSellCount: 0,
          totalBuyCount: 0,
          totalSellCount: 0,
        },
      ],
      blackoutTime
    );

    assert.deepStrictEqual(result.accepted, []);
  });

  it("triggers analysis once all symbols are captured", async () => {
    const { NavigatorService } = await import("../extension/background/navigator.js");

    const navigator = new NavigatorService();
    navigator.planSymbols(["AAA", "BBB"]);
    const collectionTime = new Date(Date.UTC(2024, 0, 1, 9, 40)); // 13:10 Tehran

    const baseSnapshot = {
      symbolName: "Test",
      symbolAbbreviation: "TST",
      predictedSwingPercent: 0,
      predictedSwingProbability: 0.5,
      close: 10,
      primeCost: 9,
      open: 9,
      tradesCount: 1,
      tradingVolume: 1,
      tradingValue: 1,
      marketValue: 1,
      closeTime: collectionTime.toISOString(),
      status: "open",
      low: 8,
      high: 11,
      allowedLow: 7,
      allowedHigh: 12,
      shareCount: 1,
      baseVolume: 1,
      floatingShares: 1,
      averageMonthlyVolume: 1,
      naturalBuyVolume: 1,
      naturalSellVolume: 1,
      juridicalBuyVolume: 1,
      juridicalSellVolume: 1,
      totalBuyVolume: 1,
      totalSellVolume: 1,
      naturalBuyCount: 1,
      naturalSellCount: 1,
      juridicalBuyCount: 1,
      juridicalSellCount: 1,
      totalBuyCount: 1,
      totalSellCount: 1,
    };

    navigator.recordSnapshots(
      Array.from({ length: 7 }, (_, idx) => ({
        ...baseSnapshot,
        id: "AAA",
        dateTime: new Date(collectionTime.getTime() - idx * 86400000).toISOString(),
      })),
      collectionTime
    );

    navigator.recordSnapshots(
      Array.from({ length: 7 }, (_, idx) => ({
        ...baseSnapshot,
        id: "BBB",
        dateTime: new Date(collectionTime.getTime() - idx * 86400000).toISOString(),
      })),
      collectionTime
    );

    assert.ok(navigator.analysisResult, "analysis should have executed");
    assert.strictEqual(navigator.analysisResult.ranked.length > 0, true);
  });
});
