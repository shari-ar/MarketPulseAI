const { test, describe } = require("node:test");
const assert = require("assert");

describe("market time utilities", () => {
  test("locks only during the configured market window in Asia/Tehran", async () => {
    const { isWithinMarketLockWindow } = await import("../extension/time.js");

    const beforeWindow = new Date(Date.UTC(2024, 0, 1, 4, 29)); // 07:59 in Asia/Tehran
    const atWindowStart = new Date(Date.UTC(2024, 0, 1, 4, 30)); // 08:00 in Asia/Tehran
    const duringWindow = new Date(Date.UTC(2024, 0, 1, 8, 59)); // 12:29 in Asia/Tehran
    const atWindowEnd = new Date(Date.UTC(2024, 0, 1, 9, 30)); // 13:00 in Asia/Tehran

    assert.strictEqual(isWithinMarketLockWindow(beforeWindow), false);
    assert.strictEqual(isWithinMarketLockWindow(atWindowStart), true);
    assert.strictEqual(isWithinMarketLockWindow(duringWindow), true);
    assert.strictEqual(isWithinMarketLockWindow(atWindowEnd), false);
  });

  test("formats a clock string in Tehran time", async () => {
    const { formatMarketClock } = await import("../extension/time.js");

    const noonTehran = new Date(Date.UTC(2024, 0, 1, 8, 30)); // 12:00 in Asia/Tehran
    const formatted = formatMarketClock(noonTehran);

    assert.strictEqual(formatted, "12:00");
  });
});
