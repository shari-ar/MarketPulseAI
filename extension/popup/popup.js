import * as XLSX from "xlsx";
import { rankSwingResults } from "../analysis/rank.js";
import { SNAPSHOT_FIELDS } from "../storage/schema.js";
import { logPopupEvent, popupLogger } from "./logger.js";

const COLUMN_ORDER = Object.keys(SNAPSHOT_FIELDS);
const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

// Excel workbook creation and import/export helpers for the popup UI.
/**
 * Build an Excel workbook representing the provided ranking rows using the
 * snapshot schema column ordering. Null placeholders keep cells aligned when
 * individual records have missing properties.
 */
export function buildExportWorkbook(rows = []) {
  const data = [COLUMN_ORDER];
  rows.forEach((row) => {
    data.push(COLUMN_ORDER.map((key) => row[key] ?? null));
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "rankings");
  return workbook;
}

/**
 * Deduplicate imported rows before merging them into the existing ranking
 * collection. Records are keyed by id + timestamp to avoid double-counting the
 * same snapshot when users re-import exports.
 */
export function mergeImportedRows(existing = [], incoming = []) {
  const byKey = new Set(existing.map((row) => `${row.id}-${row.dateTime}`));
  incoming.forEach((row) => {
    const key = `${row.id}-${row.dateTime}`;
    if (!byKey.has(key)) {
      existing.push(row);
      byKey.add(key);
    }
  });
  return existing;
}

/**
 * Populate the rankings table with the provided set of swing predictions.
 * Rows are highlighted when they fall within the top five entries to surface
 * the highest-confidence predictions in the popup view.
 */
function renderRankings(rows = []) {
  if (typeof document === "undefined") return;
  const tbody = document.querySelector("#rankings tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (index < 5) tr.classList.add("highlight");
    tr.innerHTML = `
      <td>${row.symbolAbbreviation || row.id}</td>
      <td>${(row.predictedSwingProbability * 100).toFixed(1)}%</td>
      <td>${row.predictedSwingPercent.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Generate and trigger a download of the current ranking rows as an Excel
 * workbook. Files are timestamped to keep user exports distinct.
 */
function exportCurrentRows(rows) {
  const workbook = buildExportWorkbook(rows);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  XLSX.writeFile(workbook, `marketpulseai-${timestamp}.xlsx`);
  logPopupEvent({
    type: "info",
    message: "Exported ranking workbook",
    context: { rowCount: rows.length, timestamp },
  });
}

/**
 * Wire up popup controls for exporting/importing Excel data and hydrate the
 * UI with the latest locally cached ranking results when available.
 */
function setupUi() {
  if (typeof document === "undefined") return;
  const exportBtn = document.getElementById("export");
  const importBtn = document.getElementById("import");
  const importFile = document.getElementById("import-file");

  let latestRows = [];

  const handleExport = () => exportCurrentRows(latestRows);
  const handleImport = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      const beforeCount = latestRows.length;
      latestRows = mergeImportedRows(latestRows, rows);
      const ranked = rankSwingResults(latestRows);
      renderRankings(ranked);
      logPopupEvent({
        type: "info",
        message: "Imported ranking workbook",
        context: {
          filename: file.name,
          sizeBytes: file.size,
          incomingRows: rows.length,
          dedupedCount: latestRows.length - beforeCount,
          totalRows: latestRows.length,
        },
      });
    } catch (error) {
      logPopupEvent({
        type: "error",
        message: "Failed to import workbook",
        context: { filename: file?.name, error: error?.message },
      });
    }
  };

  exportBtn?.addEventListener("click", handleExport);
  importBtn?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", handleImport);

  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.get(["rankedResults"], ({ rankedResults = [] }) => {
      latestRows = rankedResults;
      renderRankings(rankSwingResults(rankedResults));
      logPopupEvent({
        type: "info",
        message: "Hydrated popup from storage",
        context: { cachedRows: rankedResults.length },
      });
    });
  }

  popupLogger.prune();
  logPopupEvent({
    type: "info",
    message: "Initialized popup UI",
    context: { hasChrome: Boolean(chromeApi?.storage?.local) },
  });
}

setupUi();
