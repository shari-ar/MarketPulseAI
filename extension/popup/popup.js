import { read, utils, writeFile } from "./xlsx-loader.js";
import { rankSwingResults } from "../analysis/rank.js";
import { SNAPSHOT_FIELDS } from "../storage/schema.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { logPopupEvent, popupLogger } from "./logger.js";
import { createStorageAdapter } from "../storage/adapter.js";

const COLUMN_ORDER = Object.keys(SNAPSHOT_FIELDS);
const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;
const runtimeConfig = getRuntimeConfig();
const storage = createStorageAdapter();

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

  const worksheet = utils.aoa_to_sheet(data);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "rankings");
  return workbook;
}

/**
 * Deduplicate imported rows before merging them into the existing ranking
 * collection. Records are keyed by id + timestamp to avoid double-counting the
 * same snapshot when users re-import exports.
 */
export function mergeImportedRows(existing = [], incoming = []) {
  const byKey = new Set(existing.map((row) => `${row.id}-${row.dateTime}`));
  const merged = existing.map((row) => ({ ...row }));
  incoming.forEach((row) => {
    const key = `${row.id}-${row.dateTime}`;
    if (!byKey.has(key)) {
      merged.push(row);
      byKey.add(key);
    }
  });
  return merged;
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
    if (index < runtimeConfig.TOP_SWING_COUNT) tr.classList.add("highlight");
    const probability = Number.isFinite(row.predictedSwingProbability)
      ? `${(row.predictedSwingProbability * 100).toFixed(1)}%`
      : "--";
    const swingPercent = Number.isFinite(row.predictedSwingPercent)
      ? `${row.predictedSwingPercent.toFixed(2)}%`
      : "--";
    tr.innerHTML = `
      <td>${row.symbolAbbreviation || row.id}</td>
      <td>${probability}</td>
      <td>${swingPercent}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateAnalysisModal(status) {
  if (typeof document === "undefined") return;
  const modal = document.getElementById("analysis-modal");
  const progressBar = document.getElementById("analysis-progress-bar");
  const statusText = document.getElementById("analysis-status-text");
  if (!modal || !progressBar || !statusText) return;

  if (!status || status.state === "complete") {
    modal.classList.add("hidden");
    return;
  }

  modal.classList.remove("hidden");
  const progressPercent = Math.round((status.progress || 0) * 100);
  progressBar.style.width = `${progressPercent}%`;
  statusText.textContent =
    status.state === "error"
      ? `Analysis failed: ${status.error || "Unknown error"}`
      : `Analysis running (${progressPercent}%)`;
}

async function hydrateExistingSnapshots() {
  const snapshots = await storage.getSnapshots();
  return Array.isArray(snapshots) ? snapshots : [];
}

async function persistImportedRows(rows = []) {
  const existing = await hydrateExistingSnapshots();
  const existingKeys = new Set(existing.map((row) => `${row.id}-${row.dateTime}`));
  const freshRows = rows.filter((row) => !existingKeys.has(`${row.id}-${row.dateTime}`));
  if (!freshRows.length) return { inserted: 0 };
  await storage.addSnapshots(freshRows);
  return { inserted: freshRows.length };
}

/**
 * Generate and trigger a download of the current ranking rows as an Excel
 * workbook. Files are timestamped to keep user exports distinct.
 */
function exportCurrentRows(rows) {
  const workbook = buildExportWorkbook(rows);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFile(workbook, `marketpulseai-${timestamp}.xlsx`);
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
      const workbook = read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = utils.sheet_to_json(sheet);
      const beforeCount = latestRows.length;
      latestRows = mergeImportedRows(latestRows, rows);
      const { inserted } = await persistImportedRows(rows);
      const ranked = rankSwingResults(latestRows);
      renderRankings(ranked);
      if (chromeApi?.storage?.local?.set) {
        chromeApi.storage.local.set({ rankedResults: ranked });
      }
      logPopupEvent({
        type: "info",
        message: "Imported ranking workbook",
        context: {
          filename: file.name,
          sizeBytes: file.size,
          incomingRows: rows.length,
          dedupedCount: latestRows.length - beforeCount,
          insertedCount: inserted,
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
    chromeApi.storage.local.get(
      ["rankedResults", "analysisStatus"],
      ({ rankedResults = [], analysisStatus }) => {
        latestRows = rankedResults;
        renderRankings(rankSwingResults(rankedResults));
        updateAnalysisModal(analysisStatus);
        logPopupEvent({
          type: "info",
          message: "Hydrated popup from storage",
          context: { cachedRows: rankedResults.length },
        });
      }
    );

    chromeApi.storage.onChanged.addListener((changes) => {
      if (changes.analysisStatus) {
        updateAnalysisModal(changes.analysisStatus.newValue);
      }
      if (changes.rankedResults) {
        latestRows = changes.rankedResults.newValue || [];
        renderRankings(rankSwingResults(latestRows));
      }
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
