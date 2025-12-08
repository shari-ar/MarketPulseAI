const assert = require("assert");
const { describe, it } = require("node:test");

const baseRecord = {
  id: "FOLD",
  dateTime: "2024-06-10T13:00:00Z",
  symbolName: "بانک ملت",
  symbolAbbreviation: "وبملت",
  lastTrade: 3566,
  closingPrice: 3549,
  firstPrice: 3507,
  tradesCount: 1421,
  tradingVolume: 7799903,
  tradingValue: 27679973416,
  marketValue: 35490000000000,
  lastPriceTime: "10:58:16",
  status: "مجاز",
  dailyLowRange: 3507,
  dailyHighRange: 3595,
  allowedLowPrice: 3464,
  allowedHighPrice: 3678,
  shareCount: 10000000000,
  baseVolume: 4096123,
  floatingShares: null,
  averageMonthlyVolume: 26163963,
  realBuyVolume: 4608459,
  realSellVolume: 4849394,
  legalBuyVolume: 3191444,
  legalSellVolume: 2950509,
  totalBuyVolume: 7799903,
  totalSellVolume: 7799903,
  realBuyCount: 98,
  realSellCount: 1114,
  legalBuyCount: 5,
  legalSellCount: 2,
  totalBuyCount: 103,
  totalSellCount: 1116,
};

describe("write validation", () => {
  it("rejects invalid snapshot shapes before persisting", async () => {
    const { saveSnapshotRecord } = await import("../extension/storage/writes.js");

    const errors = [];
    const table = {
      add: () => {
        errors.push("add called");
      },
    };

    await assert.rejects(
      () => saveSnapshotRecord({ ...baseRecord, lastTrade: "oops" }, { table }),
      /Invalid snapshot record: lastTrade must be a finite number/
    );
    assert.deepStrictEqual(errors, []);
  });

  it("normalizes timestamps and writes through when valid", async () => {
    const { saveSnapshotRecord } = await import("../extension/storage/writes.js");

    let saved = null;
    const table = {
      add: async (payload) => {
        saved = payload;
        return 42;
      },
    };

    const id = await saveSnapshotRecord(baseRecord, { table });

    assert.strictEqual(id, 42);
    assert.strictEqual(saved.dateTime, "2024-06-10T13:00:00.000Z");
    assert.strictEqual(saved.id, "FOLD");
  });

  it("details validation issues for timestamps and numeric fields", async () => {
    const { validateSnapshotRecord } = await import("../extension/storage/validation.js");

    const { valid, errors } = validateSnapshotRecord({
      ...baseRecord,
      dateTime: "not-a-date",
      lastTrade: null,
      tradesCount: "oops",
      totalBuyCount: "nan",
    });

    assert.strictEqual(valid, false);
    assert.deepStrictEqual(errors, [
      "dateTime must be a valid timestamp",
      "lastTrade must be a finite number",
      "tradesCount must be a finite number",
      "totalBuyCount must be a finite number",
    ]);
  });
});
