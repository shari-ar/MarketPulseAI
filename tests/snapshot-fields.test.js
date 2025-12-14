const assert = require("assert");
const { describe, it } = require("node:test");

describe("snapshot field validation helpers", () => {
  it("ignores optional fields when determining completeness", async () => {
    const { missingSnapshotFields, hasCompleteSnapshot } = await import(
      "../extension/navigation/snapshotFields.js"
    );

    const snapshot = {
      close: 1200,
      primeCost: 1180,
      floatingShares: null,
      predictedSwingPercent: undefined,
    };

    assert.deepStrictEqual(missingSnapshotFields(snapshot), []);
    assert.strictEqual(hasCompleteSnapshot(snapshot), true);
  });

  it("still reports required fields while skipping optional ones", async () => {
    const { missingSnapshotFields, hasCompleteSnapshot } = await import(
      "../extension/navigation/snapshotFields.js"
    );

    const snapshot = {
      close: 1200,
      primeCost: undefined,
      floatingShares: undefined,
    };

    assert.deepStrictEqual(missingSnapshotFields(snapshot), ["primeCost"]);
    assert.strictEqual(hasCompleteSnapshot(snapshot), false);
  });
});
