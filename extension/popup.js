import db from "./storage/db.js";
import { SNAPSHOT_TABLE } from "./storage/schema.js";
import { saveSnapshotRecord } from "./storage/writes.js";
import {
  formatMarketClock,
  isBeforeMarketClose,
  currentMarketTimestamp,
  currentMarketDate,
  MARKET_TIMEZONE,
} from "./time.js";
import { detectSymbolFromUrl, pickLatestBySymbol } from "./popup-helpers.js";
import { extractTopBoxSnapshotFromPage } from "./parsing/price.js";

const message = document.getElementById("message");
const ping = document.getElementById("ping");
const lockBanner = document.getElementById("lock-banner");
const lockTag = document.getElementById("lock-tag");
const marketClock = document.getElementById("market-clock");
const lockCopy = document.getElementById("lock-copy");

const symbolHeading = document.getElementById("symbol-heading");
const symbolStatus = document.getElementById("symbol-status");
const priceOpen = document.getElementById("price-open");
const priceHigh = document.getElementById("price-high");
const priceLow = document.getElementById("price-low");
const priceClose = document.getElementById("price-close");
const refreshPrice = document.getElementById("refresh-price");

const todayStatus = document.getElementById("today-status");
const todayList = document.getElementById("today-list");
const loadToday = document.getElementById("load-today");

const chromeApi = globalThis.chrome;

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
  const locked = isBeforeMarketClose(now);
  const formattedClock = `${formatMarketClock(now)} Asia/Tehran`;

  marketClock.textContent = formattedClock;

  if (locked) {
    lockBanner.classList.add("notice--locked");
    lockBanner.classList.remove("notice--open");
    lockTag.textContent = "Locked until 13:00";
    lockTag.classList.add("pill--locked");
    lockTag.classList.remove("pill--open");
    lockCopy.textContent =
      "Collection is in read-only mode until the market closes at 13:00 Asia/Tehran.";
    message.textContent = "Hold tight—writes unlock after the closing bell.";
    ping.disabled = true;
    ping.setAttribute("aria-disabled", "true");
  } else {
    lockBanner.classList.remove("notice--locked");
    lockBanner.classList.add("notice--open");
    lockTag.textContent = "Unlocked";
    lockTag.classList.remove("pill--locked");
    lockTag.classList.add("pill--open");
    lockCopy.textContent = `Market closed at 13:00 Asia/Tehran. Collection is greenlit as of ${currentMarketTimestamp(now)}.`;
    message.textContent = "Post-close collection is ready to run.";
    ping.disabled = false;
    ping.removeAttribute("aria-disabled");
  }
}

updateLockState();
setInterval(() => updateLockState(), 30000);

ping.addEventListener("click", async () => {
  await db.open();
  const tableNames = db.tables.map((table) => table.name).join(", ");
  message.textContent = `IndexedDB tables: ${tableNames || "none"}`;
});

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return Number(value).toLocaleString("en-US");
}

function renderPriceCard({ symbol, snapshot, source }) {
  symbolHeading.textContent = symbol ? `${symbol} TopBox` : "Symbol snapshot";
  symbolStatus.textContent = source || "";
  priceOpen.textContent = formatNumber(snapshot?.lastTrade ?? null);
  priceHigh.textContent = formatNumber(snapshot?.closingPrice ?? null);
  priceLow.textContent = formatNumber(snapshot?.firstPrice ?? null);
  priceClose.textContent = formatNumber(snapshot?.tradingVolume ?? null);
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
  const symbolMatch = (result?.result?.href ?? "").match(/\/InstInfo\/([^/?#]+)/i);
  const symbol = symbolMatch ? decodeURIComponent(symbolMatch[1]) : null;
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
  if (isBeforeMarketClose()) return;

  await saveSnapshotRecord({
    id: symbol,
    dateTime: new Date().toISOString(),
    ...snapshot,
  });
}

function marketDateFromIso(isoString) {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

async function renderActiveTabPrice() {
  symbolStatus.textContent = "Detecting symbol...";
  renderPriceCard({ symbol: null, snapshot: null, source: null });

  const [tab] = (await queryActiveTab()) || [];
  const symbol = detectSymbolFromUrl(tab?.url ?? "");

  if (!symbol) {
    symbolStatus.textContent = "Open a TSETMC instrument page to view its TopBox.";
    return;
  }

  const fromDb = await loadLatestFromDb(symbol);
  if (fromDb) {
    renderPriceCard({ symbol, snapshot: fromDb, source: "Loaded from IndexedDB" });
    return;
  }

  symbolStatus.textContent = "Scraping this tab...";
  const snapshot = await pollForSnapshot(tab?.id, { timeoutMs: 6000, intervalMs: 700 });
  if (snapshot?.snapshot) {
    renderPriceCard({ symbol, snapshot: snapshot.snapshot, source: "Captured from page" });
    await saveScrapedSnapshot(symbol, snapshot.snapshot);
  } else {
    renderPriceCard({ symbol, snapshot: null, source: null });
    symbolStatus.textContent = "No TopBox metrics found yet. Try again after the page loads.";
  }
}

async function loadTodayPrices() {
  todayStatus.textContent = "Loading today's captures...";
  todayList.innerHTML = "";

  await db.open();
  const tradeDate = currentMarketDate();
  const entries = await db.table(SNAPSHOT_TABLE).toArray();
  const todaysEntries = entries.filter(
    (entry) => entry?.dateTime && marketDateFromIso(entry.dateTime) === tradeDate
  );
  const latestPerSymbol = pickLatestBySymbol(todaysEntries);

  if (!latestPerSymbol.length) {
    todayStatus.textContent = "No snapshots stored for today yet.";
    return;
  }

  todayStatus.textContent = `Showing ${latestPerSymbol.length} symbol${
    latestPerSymbol.length === 1 ? "" : "s"
  } for ${tradeDate}.`;

  const fragment = document.createDocumentFragment();
  latestPerSymbol
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((record) => {
      const li = document.createElement("li");
      const symbolSpan = document.createElement("span");
      symbolSpan.className = "symbol";
      symbolSpan.textContent = record.id;

      const priceSpan = document.createElement("span");
      priceSpan.className = "price";
      const displayValue = record.closingPrice ?? record.lastTrade ?? record.firstPrice ?? null;
      priceSpan.textContent = formatNumber(displayValue);

      li.appendChild(symbolSpan);
      li.appendChild(priceSpan);
      fragment.appendChild(li);
    });

  todayList.appendChild(fragment);
}

refreshPrice.addEventListener("click", () => renderActiveTabPrice());
loadToday.addEventListener("click", () => loadTodayPrices());

renderActiveTabPrice();
