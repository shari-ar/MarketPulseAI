import db from "./storage/db.js";
import { ANALYSIS_CACHE_TABLE, SNAPSHOT_TABLE } from "./storage/schema.js";
import * as XLSX from "./vendor/xlsx.mjs";
import { GLOBAL_STATUS, onStatusChange, requestGlobalStatus } from "./status-bus.js";
import {
  formatMarketClock,
  isWithinMarketLockWindow,
  formatMarketLockWindow,
  currentMarketTimestamp,
  MARKET_TIMEZONE,
  marketDateFromIso,
} from "./time.js";
import { pickLatestBySymbol } from "./popup-helpers.js";
import { getLastAnalysisStatus } from "./storage/analysis-status.js";

const lockChip = document.getElementById("lock-chip");
const lockCopy = document.getElementById("lock-copy");
const storedStatus = document.getElementById("stored-status");
const downloadStored = document.getElementById("download-stored");
const statusChip = document.getElementById("status-chip");
const analysisStatus = document.getElementById("analysis-status");
const analysisResults = document.getElementById("analysis-results");
const refreshAnalysis = document.getElementById("refresh-analysis");

const SNAPSHOT_FIELD_CONFIG = [
  { key: "symbolName", label: "Symbol name" },
  { key: "symbolAbbreviation", label: "Abbreviation" },
  { key: "predictedSwingPercent", label: "Predicted swing (%)" },
  { key: "lastTrade", label: "Last trade" },
  { key: "closingPrice", label: "Closing price" },
  { key: "firstPrice", label: "First price" },
  { key: "tradesCount", label: "Trades" },
  { key: "tradingVolume", label: "Volume" },
  { key: "tradingValue", label: "Value" },
  { key: "marketValue", label: "Market value" },
  { key: "lastPriceTime", label: "Last price time" },
  { key: "status", label: "Status" },
  { key: "dailyLowRange", label: "Daily low" },
  { key: "dailyHighRange", label: "Daily high" },
  { key: "allowedLowPrice", label: "Allowed low" },
  { key: "allowedHighPrice", label: "Allowed high" },
  { key: "shareCount", label: "Share count" },
  { key: "baseVolume", label: "Base volume" },
  { key: "floatingShares", label: "Floating shares" },
  { key: "averageMonthlyVolume", label: "Avg monthly vol" },
  { key: "realBuyVolume", label: "Real buy vol" },
  { key: "legalBuyVolume", label: "Legal buy vol" },
  { key: "realSellVolume", label: "Real sell vol" },
  { key: "legalSellVolume", label: "Legal sell vol" },
  { key: "totalBuyVolume", label: "Total buy vol" },
  { key: "totalSellVolume", label: "Total sell vol" },
  { key: "realBuyCount", label: "Real buy count" },
  { key: "legalBuyCount", label: "Legal buy count" },
  { key: "realSellCount", label: "Real sell count" },
  { key: "legalSellCount", label: "Legal sell count" },
  { key: "totalBuyCount", label: "Total buy count" },
  { key: "totalSellCount", label: "Total sell count" },
];

const STATUS_LABELS = {
  [GLOBAL_STATUS.IDLE]: "Idle",
  [GLOBAL_STATUS.COLLECTING]: "Collecting",
  [GLOBAL_STATUS.ANALYZING]: "Analyzing",
};

function updateLockState(now = new Date()) {
  const locked = isWithinMarketLockWindow(now);
  const formattedClock = `${formatMarketClock(now)} Asia/Tehran`;
  lockChip.textContent = locked ? "Locked" : "Unlocked";
  lockChip.classList.toggle("lock-chip--locked", locked);
  lockChip.classList.toggle("lock-chip--open", !locked);

  if (locked) {
    lockCopy.textContent = `Read-only during ${formatMarketLockWindow()} ${MARKET_TIMEZONE}. Current time: ${formattedClock}.`;
  } else {
    lockCopy.textContent = `Lock window (${formatMarketLockWindow()} ${MARKET_TIMEZONE}) has ended. Writes are open as of ${currentMarketTimestamp(now)}.`;
  }

  return locked;
}

function renderStatusChip(status = GLOBAL_STATUS.IDLE) {
  if (!statusChip) return;

  const normalized = STATUS_LABELS[status] ? status : GLOBAL_STATUS.IDLE;
  const label = STATUS_LABELS[normalized];

  statusChip.textContent = label;
  statusChip.setAttribute("aria-label", `Extension status: ${label}`);
  statusChip.classList.remove(
    "status-chip--idle",
    "status-chip--collecting",
    "status-chip--analyzing"
  );
  statusChip.classList.add(`status-chip--${normalized}`);
}

async function hydrateStatusChip() {
  renderStatusChip(GLOBAL_STATUS.IDLE);
  const status = await requestGlobalStatus();
  renderStatusChip(status?.value);
}

onStatusChange((nextStatus) => renderStatusChip(nextStatus));

updateLockState();
setInterval(() => updateLockState(), 30000);
hydrateStatusChip();

function formatAnalysisTimestamp(isoTimestamp) {
  if (!isoTimestamp) return "--";
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) return "--";

  const marketDate = marketDateFromIso(isoTimestamp) ?? date.toISOString().slice(0, 10);
  const time = date.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false });

  return `${marketDate} · ${time} UTC`;
}

function renderAnalysisRows(entries) {
  analysisResults.innerHTML = "";

  if (!Array.isArray(entries) || entries.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "No analysis results available.";
    td.classList.add("placeholder");
    tr.appendChild(td);
    analysisResults.appendChild(tr);
    return;
  }

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    const symbolCell = document.createElement("td");
    symbolCell.textContent = entry.symbol;
    const timestampCell = document.createElement("td");
    timestampCell.textContent = formatAnalysisTimestamp(entry.lastAnalyzedAt);
    if (!entry.lastAnalyzedAt) timestampCell.classList.add("placeholder");
    tr.appendChild(symbolCell);
    tr.appendChild(timestampCell);
    fragment.appendChild(tr);
  });

  analysisResults.appendChild(fragment);
}

async function hydrateAnalysisSection() {
  if (analysisStatus) {
    analysisStatus.textContent = "Loading analysis status...";
  }

  await db.open();
  const [cachedStatuses, lastStatus] = await Promise.all([
    db
      .table(ANALYSIS_CACHE_TABLE)
      .toArray()
      .catch(() => []),
    getLastAnalysisStatus().catch(() => null),
  ]);

  const sorted = (Array.isArray(cachedStatuses) ? cachedStatuses : [])
    .filter((entry) => entry?.symbol)
    .sort((left, right) => {
      const leftTime = new Date(left.lastAnalyzedAt || 0).getTime();
      const rightTime = new Date(right.lastAnalyzedAt || 0).getTime();
      return rightTime - leftTime;
    });

  const normalizedStatus = lastStatus || null;
  const state = normalizedStatus?.state || (sorted.length ? "success" : "not_run");
  const analyzedCount = normalizedStatus?.analyzedCount ?? sorted.length;

  if (state === "not_run") {
    if (analysisStatus) {
      analysisStatus.textContent =
        normalizedStatus?.message ||
        "Analysis not performed yet because no symbols have been analyzed.";
    }
    renderAnalysisRows([]);
    return;
  }

  if (state === "skipped") {
    if (analysisStatus) {
      analysisStatus.textContent =
        normalizedStatus?.message || "Analysis was skipped because no data was available.";
    }
    renderAnalysisRows([]);
    return;
  }

  if (state === "error") {
    const detail = normalizedStatus?.details ? ` Details: ${normalizedStatus.details}` : "";
    if (analysisStatus) {
      analysisStatus.textContent = `Analysis failed: ${
        normalizedStatus?.message || "Unknown error."
      }${detail ? ` (${detail})` : ""}`;
    }
    renderAnalysisRows(sorted);
    return;
  }

  const mostRecentTimestamp = sorted[0]?.lastAnalyzedAt || normalizedStatus?.timestamp;
  const timestampLabel = formatAnalysisTimestamp(mostRecentTimestamp);
  const baseMessage =
    normalizedStatus?.message ||
    (analyzedCount
      ? `Last analysis finished for ${analyzedCount} symbol${analyzedCount === 1 ? "" : "s"}.`
      : "Analysis finished, but no cache entries were found.");

  if (analysisStatus) {
    analysisStatus.textContent = timestampLabel
      ? `${baseMessage} Latest run: ${timestampLabel}.`
      : baseMessage;
  }

  renderAnalysisRows(sorted.slice(0, 12));
}

async function downloadStoredSymbols() {
  storedStatus.textContent = "Preparing stored symbols export...";
  await db.open();
  const entries = await db.table(SNAPSHOT_TABLE).toArray();
  if (!entries.length) {
    storedStatus.textContent = "No stored symbols yet.";
    return;
  }

  const latestPerSymbol = pickLatestBySymbol(entries);
  if (!latestPerSymbol.length) {
    storedStatus.textContent = "No stored symbols yet.";
    return;
  }

  const sorted = [...latestPerSymbol].sort((a, b) => a.id.localeCompare(b.id));
  const columns = [
    { key: "id", label: "Symbol" },
    { key: "dateTime", label: "Captured (ISO)" },
    { key: "capturedDate", label: "Captured (Market date)" },
    ...SNAPSHOT_FIELD_CONFIG,
  ];

  const rows = sorted.map((row) =>
    columns.reduce((acc, { key, label }) => {
      if (key === "capturedDate") {
        acc[label] = marketDateFromIso(row.dateTime) ?? "";
        return acc;
      }

      const value = row[key];
      acc[label] = value === null || value === undefined ? "" : value;
      return acc;
    }, {})
  );

  const header = columns.map(({ label }) => label);
  const sheetRows = [header, ...rows.map((row) => header.map((label) => row[label] ?? ""))];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);

  header.forEach((_, columnIndex) => {
    const cellRef = XLSX.utils.encode_cell({ c: columnIndex, r: 0 });
    const cell = worksheet[cellRef];
    if (cell) {
      cell.s = {
        font: { color: { rgb: "FFFFFF" }, bold: true },
        fill: { patternType: "solid", fgColor: { rgb: "000000" } },
      };
    }
  });

  worksheet["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  XLSX.utils.book_append_sheet(workbook, worksheet, "Stored Symbols");

  const arrayBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  });

  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stored-symbols-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);

  storedStatus.textContent = `Downloaded ${rows.length} stored symbol${rows.length === 1 ? "" : "s"}.`;
}

downloadStored.addEventListener("click", downloadStoredSymbols);
refreshAnalysis?.addEventListener("click", hydrateAnalysisSection);

hydrateAnalysisSection();
