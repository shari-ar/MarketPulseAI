const assert = require("assert");
const { describe, it } = require("node:test");

function createStubTable(records = []) {
  return {
    where() {
      return {
        equals(id) {
          const matches = records
            .filter((record) => record.id === id)
            .sort((a, b) => {
              const aTime = new Date(a.dateTime ?? 0).getTime();
              const bTime = new Date(b.dateTime ?? 0).getTime();
              return aTime - bTime;
            });

          return {
            last: async () => matches[matches.length - 1],
          };
        },
      };
    },
  };
}

describe("snapshot freshness checks", () => {
  it("returns the latest snapshot per symbol when available", async () => {
    const { findLatestSnapshotForSymbol } = await import("../extension/storage/selection.js");

    const table = createStubTable([
      { id: "AAA", dateTime: "2024-01-01T10:00:00Z", value: 1 },
      { id: "AAA", dateTime: "2024-01-02T10:00:00Z", value: 2 },
      { id: "BBB", dateTime: "2024-01-03T10:00:00Z", value: 3 },
    ]);

    const latest = await findLatestSnapshotForSymbol("AAA", { table });
    assert.deepStrictEqual(latest, {
      id: "AAA",
      dateTime: "2024-01-02T10:00:00Z",
      value: 2,
    });

    const missing = await findLatestSnapshotForSymbol("CCC", { table });
    assert.strictEqual(missing, null);
  });

  it("detects whether a symbol has been visited today", async () => {
    const { hasVisitedSnapshotForDate } = await import("../extension/storage/selection.js");

    const table = createStubTable([
      { id: "AAA", dateTime: "2024-05-20T10:00:00Z" },
      { id: "AAA", dateTime: "2024-05-21T10:00:00Z" },
    ]);

    const visited = await hasVisitedSnapshotForDate("AAA", {
      today: "2024-05-21",
      table,
    });
    assert.strictEqual(visited, true);

    const stale = await hasVisitedSnapshotForDate("AAA", {
      today: "2024-05-22",
      table,
    });
    assert.strictEqual(stale, false);
  });
});
