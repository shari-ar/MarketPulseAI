const { test, describe } = require("node:test");
const assert = require("assert");

describe("market time utilities", () => {
  test("locks before 08:00 Asia/Tehran and unlocks afterward", async () => {
    const { isBeforeMarketClose } = await import("../extension/time.js");

    const beforeClose = new Date(Date.UTC(2024, 0, 1, 4, 0)); // 07:30 in Asia/Tehran
    const atClose = new Date(Date.UTC(2024, 0, 1, 4, 30)); // 08:00 in Asia/Tehran
    const afterClose = new Date(Date.UTC(2024, 0, 1, 5, 0)); // 08:30 in Asia/Tehran

    assert.strictEqual(isBeforeMarketClose(beforeClose), true);
    assert.strictEqual(isBeforeMarketClose(atClose), false);
    assert.strictEqual(isBeforeMarketClose(afterClose), false);
  });

  test("formats a clock string in Tehran time", async () => {
    const { formatMarketClock } = await import("../extension/time.js");

    const noonTehran = new Date(Date.UTC(2024, 0, 1, 8, 30)); // 12:00 in Asia/Tehran
    const formatted = formatMarketClock(noonTehran);

    assert.strictEqual(formatted, "12:00");
  });
});
