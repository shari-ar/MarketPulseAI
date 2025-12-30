const assert = require("assert");
const { describe, it } = require("node:test");

function workbookHeader(worksheet) {
  return [worksheet.A1.v, worksheet.B1.v, worksheet.C1.v];
}

describe("Excel exports and imports", () => {
  it("exports columns matching the popup table", async () => {
    const { buildExportWorkbook } = await import("../extension/popup/popup.js");

    const workbook = buildExportWorkbook({
      snapshots: [
        {
          id: "AAA",
          dateTime: "2024-01-01T00:00:00Z",
          symbolName: "AAA Co",
          symbolAbbreviation: "AAA",
          predictedSwingPercent: 2.5,
          predictedSwingProbability: 0.65,
        },
      ],
      analysisCache: [{ symbol: "AAA", lastAnalyzedAt: "2024-01-02T00:00:00Z" }],
      logs: [
        {
          id: 1,
          type: "info",
          message: "Snapshot saved",
          context: { source: "test" },
          source: "popup",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: "2024-01-02T00:00:00Z",
          pageUrl: "http://example.com",
        },
      ],
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const header = workbookHeader(sheet);
    assert.deepStrictEqual(header, ["id", "dateTime", "symbolName"]);
    assert.deepStrictEqual(workbook.SheetNames, ["topBoxSnapshots", "analysisCache", "logs"]);
  });

  it("merges imported rows without overwriting existing records", async () => {
    const { mergeImportedRows } = await import("../extension/popup/popup.js");

    const existing = [
      {
        id: "AAA",
        dateTime: "2024-01-01T00:00:00Z",
        predictedSwingPercent: 2,
        predictedSwingProbability: 0.6,
      },
    ];

    const merged = mergeImportedRows(existing, [
      {
        id: "AAA",
        dateTime: "2024-01-01T00:00:00Z",
        predictedSwingPercent: 9,
        predictedSwingProbability: 0.9,
      },
      {
        id: "BBB",
        dateTime: "2024-01-02T00:00:00Z",
        predictedSwingPercent: 1,
        predictedSwingProbability: 0.2,
      },
    ]);

    assert.strictEqual(merged.length, 2);
    const aaa = merged.find((r) => r.id === "AAA");
    assert.strictEqual(aaa.predictedSwingPercent, 2);
  });
});
