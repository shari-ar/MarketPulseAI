import { read, utils, writeFile } from "./xlsx-loader.js";
import { rankSwingResults } from "../analysis/rank.js";
import {
  ANALYSIS_CACHE_FIELDS,
  ANALYSIS_CACHE_TABLE,
  LOG_FIELDS,
  LOG_TABLE,
  SNAPSHOT_FIELDS,
  SNAPSHOT_TABLE,
} from "../storage/schema.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { normalizeRuntimeConfig, RUNTIME_CONFIG_STORAGE_KEY } from "../runtime-settings.js";
import { logPopupEvent, popupLogger } from "./logger.js";
import { createStorageAdapter } from "../storage/adapter.js";
import { initializePopupRuntimeSettings, persistPopupRuntimeSettings } from "./settings.js";

const COLUMN_ORDER = Object.keys(SNAPSHOT_FIELDS);
const ANALYSIS_CACHE_COLUMNS = Object.keys(ANALYSIS_CACHE_FIELDS);
const LOG_COLUMNS = Object.keys(LOG_FIELDS);
const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;
let runtimeConfig = getRuntimeConfig();
const storage = createStorageAdapter();
let latestAnalysisStatus = null;

// Excel workbook creation and import/export helpers for the popup UI.
/**
 * Build an Excel workbook representing the provided ranking rows using the
 * snapshot schema column ordering. Null placeholders keep cells aligned when
 * individual records have missing properties.
 */
function buildWorksheet(columns, rows) {
  const data = [columns];
  rows.forEach((row) => {
    data.push(columns.map((key) => row?.[key] ?? null));
  });
  return utils.aoa_to_sheet(data);
}

export function buildExportWorkbook({ stocks = [], analysisCache = [], logs = [] } = {}) {
  logPopupEvent({
    type: "debug",
    message: "Building export workbook",
    context: {
      stockCount: stocks.length,
      analysisCacheCount: analysisCache.length,
      logCount: logs.length,
    },
  });
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, buildWorksheet(COLUMN_ORDER, stocks), SNAPSHOT_TABLE);
  utils.book_append_sheet(
    workbook,
    buildWorksheet(ANALYSIS_CACHE_COLUMNS, analysisCache),
    ANALYSIS_CACHE_TABLE
  );
  utils.book_append_sheet(workbook, buildWorksheet(LOG_COLUMNS, logs), LOG_TABLE);
  logPopupEvent({
    type: "debug",
    message: "Export workbook ready",
    context: { sheetCount: workbook.SheetNames.length },
  });
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
  logPopupEvent({
    type: "debug",
    message: "Merged imported rows with cache",
    context: {
      existingCount: existing.length,
      incomingCount: incoming.length,
      mergedCount: merged.length,
    },
  });
  return merged;
}

/**
 * Populate the rankings table with the provided set of swing predictions.
 * Rows are highlighted when they fall within the top five entries to surface
 * the highest-confidence predictions in the popup view.
 */
function formatCellValue(key, value) {
  if (value === null || value === undefined || value === "") return "--";
  if (key === "predictedSwingProbability") {
    return Number.isFinite(value) ? `${(value * 100).toFixed(3)}%` : "--";
  }
  if (key === "predictedSwingPercent") {
    return Number.isFinite(value) ? `${value.toFixed(3)}%` : "--";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return String(value);
}

function renderTableHeader() {
  if (typeof document === "undefined") return;
  const theadRow = document.querySelector("#rankings thead tr");
  if (!theadRow) return;
  theadRow.innerHTML = "";
  COLUMN_ORDER.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column;
    theadRow.appendChild(th);
  });
  logPopupEvent({
    type: "debug",
    message: "Rendered rankings table header",
    context: { columnCount: COLUMN_ORDER.length },
  });
}

function renderRankings(rows = []) {
  if (typeof document === "undefined") return;
  const tbody = document.querySelector("#rankings tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (index < runtimeConfig.TOP_SWING_COUNT) tr.classList.add("highlight");
    COLUMN_ORDER.forEach((column) => {
      const td = document.createElement("td");
      td.textContent = formatCellValue(column, row?.[column]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  logPopupEvent({
    type: "debug",
    message: "Rendered rankings table",
    context: { rowCount: rows.length, highlightCount: runtimeConfig.TOP_SWING_COUNT },
  });
}

/**
 * Centralized ranking helper to ensure popup logs capture ranking activity.
 *
 * @param {Array<object>} rows - Candidate rows to rank.
 * @param {Date} [now=new Date()] - Timestamp for log entries.
 * @returns {Array<object>} Ranked rows.
 */
function rankRows(rows = [], now = new Date()) {
  return rankSwingResults(rows, undefined, { logger: logPopupEvent, now });
}

// Normalize imported headers so schema checks stay resilient to Excel cell formatting.
function normalizeHeaderRow(row = []) {
  const normalized = row.map((cell) => String(cell ?? "").trim());
  logPopupEvent({
    type: "debug",
    message: "Normalized header row",
    context: { cellCount: normalized.length },
  });
  return normalized;
}

// Enforce strict column parity with the export schema.
function hasMatchingHeaders(headerRow = []) {
  if (!Array.isArray(headerRow)) return false;
  if (headerRow.length !== COLUMN_ORDER.length) return false;
  const matches = headerRow.every((header, index) => header === COLUMN_ORDER[index]);
  logPopupEvent({
    type: "debug",
    message: "Validated import headers",
    context: { matches, expectedCount: COLUMN_ORDER.length },
  });
  return matches;
}

function updateAnalysisModal(status) {
  if (typeof document === "undefined") return;
  const modal = document.getElementById("analysis-modal");
  const progressBar = document.getElementById("analysis-progress-bar");
  const statusText = document.getElementById("analysis-status-text");
  if (!modal || !progressBar || !statusText) return;

  if (!status || status.state === "complete") {
    modal.classList.add("hidden");
    logPopupEvent({
      type: "debug",
      message: "Analysis modal hidden",
      context: { state: status?.state ?? "complete" },
    });
    return;
  }

  modal.classList.remove("hidden");
  const progressPercent = Math.round((status.progress || 0) * 100);
  progressBar.style.width = `${progressPercent}%`;
  statusText.textContent =
    status.state === "error"
      ? `Analysis failed: ${status.error || "Unknown error"}`
      : `Analysis running (${progressPercent}%)`;
  logPopupEvent({
    type: "debug",
    message: "Analysis modal updated",
    context: { state: status.state, progress: status.progress },
  });
}

function getInputValue(selector) {
  if (typeof document === "undefined") return null;
  const input = document.querySelector(selector);
  return input ? input.value : null;
}

function setInputValue(selector, value) {
  if (typeof document === "undefined") return;
  const input = document.querySelector(selector);
  if (input) input.value = value ?? "";
}

function readSettingsForm() {
  const raw = {
    DB_NAME: getInputValue("#setting-db-name"),
    MARKET_TIMEZONE: getInputValue("#setting-timezone"),
    MARKET_OPEN: getInputValue("#setting-market-open"),
    MARKET_CLOSE: getInputValue("#setting-market-close"),
    ANALYSIS_DEADLINE: getInputValue("#setting-analysis-deadline"),
    TRADING_DAYS: getInputValue("#setting-trading-days"),
    RETENTION_DAYS: getInputValue("#setting-retention-days"),
    TOP_SWING_COUNT: getInputValue("#setting-top-swing-count"),
    LOG_RETENTION_DAYS: {
      error: getInputValue("#setting-log-error"),
      warning: getInputValue("#setting-log-warning"),
      info: getInputValue("#setting-log-info"),
      debug: getInputValue("#setting-log-debug"),
    },
  };
  const normalized = normalizeRuntimeConfig(raw);
  logPopupEvent({
    type: "debug",
    message: "Read settings form",
    context: { keys: Object.keys(normalized) },
  });
  return normalized;
}

function hydrateSettingsForm(config) {
  setInputValue("#setting-db-name", config.DB_NAME);
  setInputValue("#setting-timezone", config.MARKET_TIMEZONE);
  setInputValue("#setting-market-open", config.MARKET_OPEN);
  setInputValue("#setting-market-close", config.MARKET_CLOSE);
  setInputValue("#setting-analysis-deadline", config.ANALYSIS_DEADLINE);
  setInputValue("#setting-trading-days", (config.TRADING_DAYS || []).join(","));
  setInputValue("#setting-retention-days", config.RETENTION_DAYS);
  setInputValue("#setting-top-swing-count", config.TOP_SWING_COUNT);
  setInputValue("#setting-log-error", config.LOG_RETENTION_DAYS?.error);
  setInputValue("#setting-log-warning", config.LOG_RETENTION_DAYS?.warning);
  setInputValue("#setting-log-info", config.LOG_RETENTION_DAYS?.info);
  setInputValue("#setting-log-debug", config.LOG_RETENTION_DAYS?.debug);
  logPopupEvent({
    type: "debug",
    message: "Hydrated settings form",
    context: { dbName: config.DB_NAME, timezone: config.MARKET_TIMEZONE },
  });
}

/**
 * Hydrates cached snapshot rows from local storage for merge workflows.
 *
 * @returns {Promise<Array<object>>} Normalized snapshot collection.
 */
async function hydrateExistingSnapshots() {
  try {
    const snapshots = await storage.getSnapshots();
    const normalized = Array.isArray(snapshots) ? snapshots : [];
    logPopupEvent({
      type: "debug",
      message: "Loaded cached snapshots for import merge",
      context: { count: normalized.length },
    });
    return normalized;
  } catch (error) {
    logPopupEvent({
      type: "warning",
      message: "Failed to load cached snapshots",
      context: { error: error?.message },
    });
    return [];
  }
}

/**
 * Persists newly imported rows while skipping duplicates already in storage.
 *
 * @param {Array<object>} rows - Incoming snapshot rows.
 * @returns {Promise<{inserted: number}>} Inserted row count.
 */
async function persistImportedRows(rows = []) {
  const existing = await hydrateExistingSnapshots();
  const existingKeys = new Set(existing.map((row) => `${row.id}-${row.dateTime}`));
  const freshRows = rows.filter((row) => !existingKeys.has(`${row.id}-${row.dateTime}`));
  if (!freshRows.length) {
    logPopupEvent({
      type: "debug",
      message: "No new rows to persist after import",
      context: { incomingCount: rows.length, existingCount: existing.length },
    });
    return { inserted: 0 };
  }
  try {
    await storage.addSnapshots(freshRows);
    logPopupEvent({
      type: "info",
      message: "Persisted imported snapshots",
      context: { insertedCount: freshRows.length },
    });
    return { inserted: freshRows.length };
  } catch (error) {
    logPopupEvent({
      type: "warning",
      message: "Failed to persist imported snapshots",
      context: { error: error?.message, attemptedCount: freshRows.length },
    });
    throw error;
  }
}

/**
 * Generate and trigger a download of the current ranking rows as an Excel
 * workbook. Files are timestamped to keep user exports distinct.
 */
function resolveExportTimestamp(status) {
  if (status?.state === "complete" && status.updatedAt) {
    const parsed = new Date(status.updatedAt);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

async function exportDatabaseTables() {
  const [stocks, analysisCache, logs] = await Promise.all([
    storage.getSnapshots(),
    storage.getAnalysisCache(),
    storage.getLogs(),
  ]);
  const workbook = buildExportWorkbook({ stocks, analysisCache, logs });
  const timestamp = resolveExportTimestamp(latestAnalysisStatus).replace(/[:.]/g, "-");
  logPopupEvent({
    type: "debug",
    message: "Preparing export workbook",
    context: {
      stockCount: stocks.length,
      analysisCacheCount: analysisCache.length,
      logCount: logs.length,
      timestamp,
    },
  });
  writeFile(workbook, `marketpulseai-${timestamp}.xlsx`);
  logPopupEvent({
    type: "debug",
    message: "Triggered export workbook download",
    context: {
      stockCount: stocks.length,
      analysisCacheCount: analysisCache.length,
      logCount: logs.length,
      timestamp,
    },
  });
  logPopupEvent({
    type: "info",
    message: "Exported database workbook",
    context: {
      stockCount: stocks.length,
      analysisCacheCount: analysisCache.length,
      logCount: logs.length,
      timestamp,
      analysisStatus: latestAnalysisStatus?.state,
    },
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
  const settingsForm = document.getElementById("settings-form");
  const settingsReset = document.getElementById("settings-reset");
  logPopupEvent({
    type: "debug",
    message: "Resolved popup UI elements",
    context: {
      hasExport: Boolean(exportBtn),
      hasImport: Boolean(importBtn),
      hasFile: Boolean(importFile),
      hasSettingsForm: Boolean(settingsForm),
      hasSettingsReset: Boolean(settingsReset),
    },
  });

  let latestRows = [];

  const handleExport = async () => {
    logPopupEvent({
      type: "debug",
      message: "Export button clicked",
      context: { currentRows: latestRows.length },
    });
    await exportDatabaseTables();
  };
  // Import workflow: validate schema headers, merge rows, persist, and re-rank for display.
  const handleImport = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    logPopupEvent({
      type: "debug",
      message: "Import file selected",
      context: { filename: file.name, sizeBytes: file.size },
    });
    logPopupEvent({
      type: "info",
      message: "Starting ranking import",
      context: { filename: file.name, sizeBytes: file.size },
    });
    try {
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: "array" });
      const sheet = workbook.Sheets[SNAPSHOT_TABLE] ?? workbook.Sheets[workbook.SheetNames[0]];
      logPopupEvent({
        type: "debug",
        message: "Loaded import workbook",
        context: { sheetCount: workbook.SheetNames.length },
      });
      const [headerRow = []] = utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      const normalizedHeader = normalizeHeaderRow(headerRow);
      logPopupEvent({
        type: "debug",
        message: "Normalized import header row",
        context: { headerCount: normalizedHeader.length },
      });
      if (!hasMatchingHeaders(normalizedHeader)) {
        logPopupEvent({
          type: "error",
          message: "Import rejected due to mismatched schema",
          context: {
            filename: file.name,
            expected: COLUMN_ORDER,
            received: normalizedHeader,
          },
        });
        event.target.value = "";
        return;
      }

      const rows = utils.sheet_to_json(sheet);
      const beforeCount = latestRows.length;
      latestRows = mergeImportedRows(latestRows, rows);
      logPopupEvent({
        type: "debug",
        message: "Merged imported rows",
        context: { incomingRows: rows.length, beforeCount, afterCount: latestRows.length },
      });
      const { inserted } = await persistImportedRows(rows);
      const ranked = rankRows(latestRows);
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
    } finally {
      event.target.value = "";
    }
  };

  exportBtn?.addEventListener("click", handleExport);
  importBtn?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", handleImport);

  settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const normalized = readSettingsForm();
    await persistPopupRuntimeSettings(normalized);
    logPopupEvent({
      type: "info",
      message: "Submitted runtime settings update",
      context: { keys: Object.keys(normalized) },
    });
  });

  settingsReset?.addEventListener("click", async () => {
    if (!chromeApi?.storage?.local?.remove) return;
    logPopupEvent({
      type: "debug",
      message: "Reset settings clicked",
      context: {},
    });
    await chromeApi.storage.local.remove(RUNTIME_CONFIG_STORAGE_KEY);
    logPopupEvent({
      type: "info",
      message: "Reset runtime settings to defaults",
      context: {},
    });
  });

  renderTableHeader();

  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.get(
      ["rankedResults", "analysisStatus"],
      ({ rankedResults = [], analysisStatus }) => {
        latestRows = rankedResults;
        renderRankings(rankRows(rankedResults));
        latestAnalysisStatus = analysisStatus || null;
        updateAnalysisModal(analysisStatus);
        logPopupEvent({
          type: "debug",
          message: "Loaded cached analysis status",
          context: { state: analysisStatus?.state ?? "none" },
        });
        logPopupEvent({
          type: "info",
          message: "Hydrated popup from storage",
          context: { cachedRows: rankedResults.length },
        });
      }
    );

    chromeApi.storage.onChanged.addListener((changes) => {
      if (changes.analysisStatus) {
        latestAnalysisStatus = changes.analysisStatus.newValue || null;
        updateAnalysisModal(changes.analysisStatus.newValue);
        logPopupEvent({
          type: "debug",
          message: "Analysis status updated from storage",
          context: { state: changes.analysisStatus.newValue?.state ?? "none" },
        });
      }
      if (changes.rankedResults) {
        latestRows = changes.rankedResults.newValue || [];
        renderRankings(rankRows(latestRows));
        logPopupEvent({
          type: "debug",
          message: "Ranked results updated from storage",
          context: { rowCount: latestRows.length },
        });
      }
    });
  }

  popupLogger.prune();
  logPopupEvent({
    type: "info",
    message: "Initialized popup UI",
    context: { hasChrome: Boolean(chromeApi?.storage?.local) },
  });

  initializePopupRuntimeSettings({
    onUpdate: (config) => {
      runtimeConfig = config;
      storage.updateConfig?.(config);
      hydrateSettingsForm(runtimeConfig);
      renderRankings(rankRows(latestRows));
      logPopupEvent({
        type: "debug",
        message: "Popup runtime settings updated",
        context: { dbName: config.DB_NAME },
      });
    },
  });

  hydrateSettingsForm(runtimeConfig);
}

setupUi();
