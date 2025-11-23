const assert = require("assert");
const { describe, it } = require("node:test");

const baseRecord = {
  symbol: "FOLD",
  tradeDate: "2024-06-10",
  open: 100.25,
  high: 110.5,
  low: 95.75,
  close: 105.1,
  volume: 123456,
  collectedAt: "2024-06-10T13:00:00Z",
};

describe("write validation", () => {
  it("rejects invalid OHLC shapes before persisting", async () => {
    const { saveOhlcRecord } = await import("../extension/storage/writes.js");

    const errors = [];
    const table = {
      add: () => {
        errors.push("add called");
      },
    };

    await assert.rejects(
      () => saveOhlcRecord({ ...baseRecord, open: "oops" }, { table }),
      /Invalid OHLC record: open must be a finite number/
    );
    assert.deepStrictEqual(errors, []);
  });

  it("normalizes timestamps and writes through when valid", async () => {
    const { saveOhlcRecord } = await import("../extension/storage/writes.js");

    let saved = null;
    const table = {
      add: async (payload) => {
        saved = payload;
        return 42;
      },
    };

    const id = await saveOhlcRecord(baseRecord, { table });

    assert.strictEqual(id, 42);
    assert.deepStrictEqual(saved, {
      ...baseRecord,
      collectedAt: "2024-06-10T13:00:00.000Z",
    });
  });

  it("blocks writes before the market closes", async () => {
    const { saveOhlcRecord } = await import("../extension/storage/writes.js");

    const errors = [];
    const table = {
      add: () => errors.push("add called"),
    };

    const beforeClose = new Date(Date.UTC(2024, 0, 1, 4, 0)); // 07:30 in Asia/Tehran

    await assert.rejects(
      () => saveOhlcRecord(baseRecord, { table, now: beforeClose }),
      /Writes are locked until 08:00 Asia\/Tehran/
    );

    assert.deepStrictEqual(errors, []);
  });

  it("details validation issues for timestamps, numeric ranges, and optional fields", async () => {
    const { validateOhlcRecord } = await import("../extension/storage/validation.js");

    const { valid, errors } = validateOhlcRecord({
      ...baseRecord,
      tradeDate: "2024-02-31",
      high: 90,
      volume: "not-a-number",
      collectedAt: "not-a-date",
    });

    assert.strictEqual(valid, false);
    assert.deepStrictEqual(errors, [
      "tradeDate must be a real date in YYYY-MM-DD",
      "volume must be a finite number when provided",
      "low cannot exceed high",
      "open cannot be above high",
      "close cannot be above high",
      "collectedAt must be a valid timestamp",
    ]);
  });
});
