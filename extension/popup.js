import db from "./storage/db.js";
import { SNAPSHOT_TABLE } from "./storage/schema.js";
import { saveSnapshotRecord } from "./storage/writes.js";
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
import { extractInstInfoSymbol } from "./inst-info.js";
import { detectSymbolFromUrl, pickLatestBySymbol } from "./popup-helpers.js";
import { extractTopBoxSnapshotFromPage } from "./parsing/price.js";

const lockChip = document.getElementById("lock-chip");
const lockCopy = document.getElementById("lock-copy");
const symbolTitle = document.getElementById("symbol-title");
const symbolHint = document.getElementById("symbol-hint");
const stockDetails = document.getElementById("stock-details");
const storedStatus = document.getElementById("stored-status");
const downloadStored = document.getElementById("download-stored");
const statusChip = document.getElementById("status-chip");

const SNAPSHOT_FIELD_CONFIG = [
  { key: "symbolName", label: "Symbol name" },
  { key: "symbolAbbreviation", label: "Abbreviation" },
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

const chromeApi = globalThis.chrome;

const STATUS_LABELS = {
  [GLOBAL_STATUS.IDLE]: "Idle",
  [GLOBAL_STATUS.COLLECTING]: "Collecting",
  [GLOBAL_STATUS.ANALYZING]: "Analyzing",
};

function queryActiveTab() {
  if (!chromeApi?.tabs?.query) return Promise.resolve([]);

  return new Promise((resolve) => {
    try {
      const maybePromise = chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) =>
        resolve(tabs || [])
      );
      if (maybePromise?.then) {
        maybePromise.then((tabs) => resolve(tabs || [])).catch(() => resolve([]));
      }
    } catch (_error) {
      resolve([]);
    }
  });
}

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

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return Number(value).toLocaleString("en-US");
}

function renderDetailsRows(snapshot) {
  stockDetails.innerHTML = "";
  const fragment = document.createDocumentFragment();

  SNAPSHOT_FIELD_CONFIG.forEach(({ key, label }) => {
    const tr = document.createElement("tr");
    const labelTd = document.createElement("td");
    labelTd.textContent = label;
    const valueTd = document.createElement("td");
    const value = snapshot ? snapshot[key] : null;
    const display = typeof value === "string" ? value || "--" : formatNumber(value);
    valueTd.textContent = display;
    if (display === "--") valueTd.classList.add("placeholder");
    tr.appendChild(labelTd);
    tr.appendChild(valueTd);
    fragment.appendChild(tr);
  });

  stockDetails.appendChild(fragment);
}

async function loadLatestFromDb(symbol) {
  if (!symbol) return null;
  await db.open();
  const matches = await db.table(SNAPSHOT_TABLE).where("id").equals(symbol).sortBy("dateTime");
  if (!matches.length) return null;
  return matches[matches.length - 1];
}

async function extractSnapshotFromTab(tabId) {
  if (!chromeApi?.scripting?.executeScript || !tabId) return null;

  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: () => ({
      html: document.documentElement?.outerHTML ?? "",
      href: window.location.href,
    }),
    world: "MAIN",
  });

  const html = result?.result?.html ?? "";
  const symbol = extractInstInfoSymbol(result?.result?.href ?? "");
  const snapshot = html ? extractTopBoxSnapshotFromPage(html) : null;

  return { symbol, snapshot };
}

async function pollForSnapshot(tabId, { timeoutMs = 5000, intervalMs = 600 } = {}) {
  const start = Date.now();
  let last = null;

  while (Date.now() - start < timeoutMs) {
    const snapshot = await extractSnapshotFromTab(tabId);
    if (snapshot?.snapshot && snapshot.symbol) return snapshot;
    last = snapshot;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return last;
}

async function saveScrapedSnapshot(symbol, snapshot) {
  if (!symbol || !snapshot) return;
  if (isWithinMarketLockWindow()) return;

  await saveSnapshotRecord({
    id: symbol,
    dateTime: new Date().toISOString(),
    ...snapshot,
  });
}

function renderEmptyState() {
  symbolHint.textContent = "Open a TSETMC instrument page to capture details.";
  renderDetailsRows(null);
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

async function hydrateActiveSymbol() {
  symbolTitle.textContent = "Detecting symbol...";
  symbolHint.textContent = "";
  renderDetailsRows(null);

  const [tab] = (await queryActiveTab()) || [];
  const symbolFromUrl = detectSymbolFromUrl(tab?.url ?? "");

  if (!symbolFromUrl) {
    symbolTitle.textContent = "No symbol detected";
    renderEmptyState();
    return;
  }

  symbolTitle.textContent = `Symbol: ${symbolFromUrl}`;
  const latest = await loadLatestFromDb(symbolFromUrl);
  if (latest) {
    symbolHint.textContent = "Loaded the latest stored snapshot.";
    renderDetailsRows(latest);
  }

  symbolHint.textContent = "Reading live HTML from the active tab...";
  const scraped = await pollForSnapshot(tab?.id, { timeoutMs: 6000, intervalMs: 700 });
  const snapshot = scraped?.snapshot ?? null;
  const resolvedSymbol = scraped?.symbol || symbolFromUrl;

  if (!snapshot) {
    symbolHint.textContent = "No metrics found on this page yet.";
    return;
  }

  symbolTitle.textContent = `Symbol: ${resolvedSymbol || symbolFromUrl}`;
  renderDetailsRows(snapshot);

  if (isWithinMarketLockWindow()) {
    symbolHint.textContent = "Captured from page (read-only during lock window).";
    return;
  }

  await saveScrapedSnapshot(resolvedSymbol, snapshot);
  symbolHint.textContent = "Captured from page and stored in the database.";
}

downloadStored.addEventListener("click", downloadStoredSymbols);

hydrateActiveSymbol();
