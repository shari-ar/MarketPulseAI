const assert = require("assert");
const { describe, it } = require("node:test");

describe("market time boundaries", () => {
  it("enforces blackout between 09:00 and 13:00 Asia/Tehran", async () => {
    const { isWithinBlackout } = await import("../extension/background/time.js");

    const before = new Date(Date.UTC(2024, 0, 1, 5, 29)); // 08:59 Tehran
    const start = new Date(Date.UTC(2024, 0, 1, 5, 30)); // 09:00 Tehran
    const during = new Date(Date.UTC(2024, 0, 1, 7, 0)); // 10:30 Tehran
    const end = new Date(Date.UTC(2024, 0, 1, 9, 29)); // 12:59 Tehran
    const after = new Date(Date.UTC(2024, 0, 1, 9, 30)); // 13:00 Tehran

    assert.strictEqual(isWithinBlackout(before), false);
    assert.strictEqual(isWithinBlackout(start), true);
    assert.strictEqual(isWithinBlackout(during), true);
    assert.strictEqual(isWithinBlackout(end), true);
    assert.strictEqual(isWithinBlackout(after), false);
  });

  it("keeps blackout off on non-trading days", async () => {
    const { isWithinBlackout } = await import("../extension/background/time.js");

    const thursday = new Date(Date.UTC(2024, 0, 4, 7, 0)); // 10:30 Tehran on Thursday

    assert.strictEqual(isWithinBlackout(thursday), false);
  });

  it("allows collection between market close and 07:00", async () => {
    const { isWithinCollectionWindow } = await import("../extension/background/time.js");

    const atClose = new Date(Date.UTC(2024, 0, 1, 9, 30)); // 13:00 Tehran
    const overnight = new Date(Date.UTC(2024, 0, 1, 21, 0)); // 00:30 Tehran next day
    const atDeadline = new Date(Date.UTC(2024, 0, 2, 3, 30)); // 07:00 Tehran
    const afterDeadline = new Date(Date.UTC(2024, 0, 2, 3, 31)); // 07:01 Tehran

    assert.strictEqual(isWithinCollectionWindow(atClose), true);
    assert.strictEqual(isWithinCollectionWindow(overnight), true);
    assert.strictEqual(isWithinCollectionWindow(atDeadline), false);
    assert.strictEqual(isWithinCollectionWindow(afterDeadline), false);
  });

  it("keeps collection open across the weekend bridge", async () => {
    const { isWithinCollectionWindow } = await import("../extension/background/time.js");

    const thursday = new Date(Date.UTC(2024, 0, 4, 6, 0)); // 09:30 Tehran on Thursday
    const fridayLate = new Date(Date.UTC(2024, 0, 5, 18, 0)); // 21:30 Tehran on Friday
    const saturdayPreDeadline = new Date(Date.UTC(2024, 0, 6, 3, 29)); // 06:59 Tehran on Saturday
    const saturdayAfterDeadline = new Date(Date.UTC(2024, 0, 6, 3, 31)); // 07:01 Tehran on Saturday

    assert.strictEqual(isWithinCollectionWindow(thursday), true);
    assert.strictEqual(isWithinCollectionWindow(fridayLate), true);
    assert.strictEqual(isWithinCollectionWindow(saturdayPreDeadline), true);
    assert.strictEqual(isWithinCollectionWindow(saturdayAfterDeadline), false);
  });
});
