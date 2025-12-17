const assert = require("assert");
const { describe, it } = require("node:test");

const baseRecord = {
  id: "FOLD",
  dateTime: "2024-06-10T13:00:00Z",
  symbolName: "بانک ملت",
  symbolAbbreviation: "وبملت",
  predictedSwingPercent: 3.5,
  predictedSwingProbability: 0.62,
  close: 3566,
  primeCost: 3549,
  open: 3507,
  tradesCount: 1421,
  tradingVolume: 7799903,
  tradingValue: 27679973416,
  marketValue: 35490000000000,
  closeTime: "10:58:16",
  status: "مجاز",
  low: 3507,
  high: 3595,
  allowedLow: 3464,
  allowedHigh: 3678,
  shareCount: 10000000000,
  baseVolume: 4096123,
  floatingShares: null,
  averageMonthlyVolume: 26163963,
  naturalBuyVolume: 4608459,
  naturalSellVolume: 4849394,
  juridicalBuyVolume: 3191444,
  juridicalSellVolume: 2950509,
  totalBuyVolume: 7799903,
  totalSellVolume: 7799903,
  naturalBuyCount: 98,
  naturalSellCount: 1114,
  juridicalBuyCount: 5,
  juridicalSellCount: 2,
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
      () => saveSnapshotRecord({ ...baseRecord, close: "oops" }, { table }),
      /Invalid snapshot record: close must be a finite number/
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
    assert.strictEqual(saved.predictedSwingPercent, 3.5);
    assert.strictEqual(saved.predictedSwingProbability, 0.62);
  });

  it("details validation issues for timestamps and numeric fields", async () => {
    const { validateSnapshotRecord } = await import("../extension/storage/validation.js");

    const { valid, errors } = validateSnapshotRecord({
      ...baseRecord,
      dateTime: "not-a-date",
      close: null,
      tradesCount: "oops",
      totalBuyCount: "nan",
    });

    assert.strictEqual(valid, false);
    assert.deepStrictEqual(errors, [
      "dateTime must be a valid timestamp",
      "close must be a finite number",
      "tradesCount must be a finite number",
      "totalBuyCount must be a finite number",
    ]);
  });
});
