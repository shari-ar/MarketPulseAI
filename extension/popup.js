import db from "./storage/db.js";
import { OHLC_TABLE } from "./storage/schema.js";
import { saveOhlcRecord } from "./storage/writes.js";
import {
  formatMarketClock,
  isBeforeMarketClose,
  currentMarketTimestamp,
  currentMarketDate,
} from "./time.js";
import { detectSymbolFromUrl, pickLatestBySymbol } from "./popup-helpers.js";

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

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return Number(value).toLocaleString("en-US");
}

function renderPriceCard({ symbol, open, high, low, close, source }) {
  symbolHeading.textContent = symbol ? `${symbol} price` : "Symbol price";
  symbolStatus.textContent = source || "";
  priceOpen.textContent = formatPrice(open);
  priceHigh.textContent = formatPrice(high);
  priceLow.textContent = formatPrice(low);
  priceClose.textContent = formatPrice(close);
}

async function loadLatestFromDb(symbol, tradeDate) {
  if (!symbol) return null;
  await db.open();
  const matches = await db
    .table(OHLC_TABLE)
    .where("[symbol+tradeDate]")
    .equals([symbol, tradeDate])
    .toArray();

  if (!matches.length) return null;
  const sorted = matches
    .map((record) => ({ ...record, collectedAt: record.collectedAt ?? null }))
    .sort((a, b) => {
      const aTime = a.collectedAt ? new Date(a.collectedAt).getTime() : 0;
      const bTime = b.collectedAt ? new Date(b.collectedAt).getTime() : 0;
      return bTime - aTime;
    });
  return sorted[0];
}

async function extractPriceFromTab(tabId) {
  if (!chromeApi?.scripting?.executeScript || !tabId) return null;

  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      function parseNum(text) {
        if (typeof text !== "string") return null;
        const cleaned = text.replace(/[^\d.-]/g, "").replace(/\.(?=.*\.)/g, "");
        if (!cleaned.trim()) return null;
        const value = Number(cleaned);
        return Number.isFinite(value) ? value : null;
      }

      const container = document.querySelector("#TopBox") ?? document;
      const openText = container.querySelector("#d04")?.textContent ?? null;
      const closeText = container.querySelector("#d03")?.textContent ?? null;
      const highNode = Array.from(container.querySelectorAll("td"))
        .find((cell) => cell.textContent?.includes("بازه روز"))
        ?.parentElement?.querySelectorAll("div");

      let low = null;
      let high = null;
      if (highNode && highNode.length >= 2) {
        low = parseNum(highNode[0].textContent);
        high = parseNum(highNode[1].textContent);
      }

      const price = {
        open: parseNum(openText),
        close: parseNum(closeText),
        low,
        high,
      };

      const hasAll = [price.open, price.high, price.low, price.close].every((v) =>
        Number.isFinite(v)
      );

      const symbolMatch = window.location.href.match(/\/InstInfo\/([^/?#]+)/i);
      const symbol = symbolMatch ? decodeURIComponent(symbolMatch[1]) : null;

      return hasAll ? { symbol, price } : { symbol, price: null };
    },
  });

  return result?.result ?? null;
}

async function pollForPrice(tabId, { timeoutMs = 5000, intervalMs = 600 } = {}) {
  const start = Date.now();
  let last = null;

  while (Date.now() - start < timeoutMs) {
    const snapshot = await extractPriceFromTab(tabId);
    if (snapshot?.price && snapshot.symbol) return snapshot;
    last = snapshot;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return last;
}

async function saveScrapedPrice(symbol, price) {
  if (!symbol || !price) return;
  if (isBeforeMarketClose()) return;

  await saveOhlcRecord({
    symbol,
    tradeDate: currentMarketDate(),
    open: price.open,
    high: price.high,
    low: price.low,
    close: price.close,
    collectedAt: new Date().toISOString(),
  });
}

async function renderActiveTabPrice() {
  symbolStatus.textContent = "Detecting symbol...";
  renderPriceCard({ symbol: null, open: null, high: null, low: null, close: null });

  const [tab] = (await queryActiveTab()) || [];
  const symbol = detectSymbolFromUrl(tab?.url ?? "");

  if (!symbol) {
    symbolStatus.textContent = "Open a TSETMC instrument page to view its price.";
    return;
  }

  const tradeDate = currentMarketDate();
  const fromDb = await loadLatestFromDb(symbol, tradeDate);
  if (fromDb) {
    renderPriceCard({ ...fromDb, symbol, source: "Loaded from IndexedDB" });
    return;
  }

  symbolStatus.textContent = "Scraping this tab...";
  const snapshot = await pollForPrice(tab?.id, { timeoutMs: 6000, intervalMs: 700 });
  if (snapshot?.price) {
    renderPriceCard({ ...snapshot.price, symbol, source: "Captured from page" });
    await saveScrapedPrice(symbol, snapshot.price);
  } else {
    renderPriceCard({ symbol, open: null, high: null, low: null, close: null });
    symbolStatus.textContent = "No TopBox prices found yet. Try again after the page loads.";
  }
}

async function loadTodayPrices() {
  todayStatus.textContent = "Loading today's captures...";
  todayList.innerHTML = "";

  await db.open();
  const tradeDate = currentMarketDate();
  const entries = await db.table(OHLC_TABLE).where("tradeDate").equals(tradeDate).toArray();
  const latestPerSymbol = pickLatestBySymbol(entries);

  if (!latestPerSymbol.length) {
    todayStatus.textContent = "No prices stored for today yet.";
    return;
  }

  todayStatus.textContent = `Showing ${latestPerSymbol.length} symbol${
    latestPerSymbol.length === 1 ? "" : "s"
  } for ${tradeDate}.`;

  const fragment = document.createDocumentFragment();
  latestPerSymbol
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .forEach((record) => {
      const li = document.createElement("li");
      const symbolSpan = document.createElement("span");
      symbolSpan.className = "symbol";
      symbolSpan.textContent = record.symbol;

      const priceSpan = document.createElement("span");
      priceSpan.className = "price";
      priceSpan.textContent = formatPrice(record.close ?? record.open);

      li.appendChild(symbolSpan);
      li.appendChild(priceSpan);
      fragment.appendChild(li);
    });

  todayList.appendChild(fragment);
}

refreshPrice.addEventListener("click", () => renderActiveTabPrice());
loadToday.addEventListener("click", () => loadTodayPrices());

renderActiveTabPrice();
