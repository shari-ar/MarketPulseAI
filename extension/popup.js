import db from "./storage/db.js";
import { DB_VERSION, OHLC_TABLE } from "./storage/schema.js";
import { summarizeRecords, latestRecordsBySymbol } from "./storage/snapshots.js";
import { formatMarketClock, isBeforeMarketClose, currentMarketTimestamp } from "./time.js";

const message = document.getElementById("message");
const ping = document.getElementById("ping");
const lockBanner = document.getElementById("lock-banner");
const lockTag = document.getElementById("lock-tag");
const marketClock = document.getElementById("market-clock");
const lockCopy = document.getElementById("lock-copy");
const refreshSnapshot = document.getElementById("refresh-snapshot");
const statsRecords = document.getElementById("stat-records");
const statsSymbols = document.getElementById("stat-symbols");
const statsLatest = document.getElementById("stat-latest");
const recentList = document.getElementById("recent-list");
const recentEmpty = document.getElementById("recent-empty");
const pagePriceStatus = document.getElementById("page-price-status");
const pagePriceRefresh = document.getElementById("page-price-refresh");
const pagePriceTitle = document.getElementById("page-price-title");
const pagePriceValues = {
  open: document.getElementById("page-price-open"),
  high: document.getElementById("page-price-high"),
  low: document.getElementById("page-price-low"),
  close: document.getElementById("page-price-close"),
  last: document.getElementById("page-price-last"),
};
const companyList = document.getElementById("company-list");
const companyListEmpty = document.getElementById("company-list-empty");
const companyListButton = document.getElementById("company-list-button");
const companyListLoading = document.getElementById("company-list-loading");

function updateLockState(now = new Date()) {
  const locked = isBeforeMarketClose(now);
  const formattedClock = `${formatMarketClock(now)} Asia/Tehran`;

  marketClock.textContent = formattedClock;

  if (locked) {
    lockBanner.classList.add("notice--locked");
    lockBanner.classList.remove("notice--open");
    lockTag.textContent = "Locked until 08:00";
    lockTag.classList.add("pill--locked");
    lockTag.classList.remove("pill--open");
    lockCopy.textContent =
      "Collection is in read-only mode until the market closes at 08:00 Asia/Tehran.";
    message.textContent = "Hold tight—writes unlock after the closing bell.";
    ping.disabled = true;
    ping.setAttribute("aria-disabled", "true");
  } else {
    lockBanner.classList.remove("notice--locked");
    lockBanner.classList.add("notice--open");
    lockTag.textContent = "Unlocked";
    lockTag.classList.remove("pill--locked");
    lockTag.classList.add("pill--open");
    lockCopy.textContent = `Market closed at 08:00 Asia/Tehran. Collection is greenlit as of ${currentMarketTimestamp(now)}.`;
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
  message.textContent = `IndexedDB v${DB_VERSION} ready (tables: ${tableNames || "none"})`;
});

function formatPrice(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "—";
}

function formatTradeDate(record) {
  if (!record?.tradeDate) return "—";
  return String(record.tradeDate);
}

function resetPagePrices(messageText) {
  pagePriceStatus.textContent = messageText;
  pagePriceTitle.textContent = "";
  for (const value of Object.values(pagePriceValues)) {
    value.textContent = "—";
  }
}

function renderRecent(records = []) {
  recentList.innerHTML = "";

  if (!records.length) {
    recentEmpty.hidden = false;
    recentList.hidden = true;
    return;
  }

  recentEmpty.hidden = true;
  recentList.hidden = false;

  for (const record of records) {
    const item = document.createElement("li");
    item.className = "recent__item";

    const top = document.createElement("div");
    top.className = "recent__top";

    const symbol = document.createElement("p");
    symbol.className = "recent__symbol";
    symbol.textContent = record.symbol;
    top.appendChild(symbol);

    const date = document.createElement("p");
    date.className = "recent__date";
    date.textContent = record.tradeDate;
    top.appendChild(date);

    item.appendChild(top);

    const prices = document.createElement("p");
    prices.className = "recent__prices";
    prices.textContent = `O ${formatPrice(record.open)} | H ${formatPrice(record.high)} | L ${formatPrice(record.low)} | C ${formatPrice(record.close)} | Last ${formatPrice(record.last)}`;
    item.appendChild(prices);

    recentList.appendChild(item);
  }
}

async function loadSnapshot() {
  try {
    await db.open();
    const records = await db.table(OHLC_TABLE).toArray();
    const snapshot = summarizeRecords(records, { recentLimit: 5 });

    statsRecords.textContent = snapshot.totalRecords.toLocaleString("en-US");
    statsSymbols.textContent = snapshot.distinctSymbols.toLocaleString("en-US");
    statsLatest.textContent = snapshot.mostRecent[0]?.tradeDate ?? "—";

    renderRecent(snapshot.mostRecent);
  } catch (error) {
    console.error("Failed to load snapshot", error);
    message.textContent = "Could not load stored OHLC data.";
  }
}

function queryActiveTab() {
  return new Promise((resolve) => {
    const chromeApi = globalThis.chrome;
    const query = chromeApi?.tabs?.query;
    if (!query) {
      resolve(null);
      return;
    }

    query.call(chromeApi.tabs, { active: true, currentWindow: true }, (tabs) => {
      const runtimeError = chromeApi.runtime?.lastError;
      if (runtimeError) {
        console.debug("Active tab query failed", runtimeError.message);
        resolve(null);
        return;
      }

      resolve(Array.isArray(tabs) && tabs[0] ? tabs[0] : null);
    });
  });
}

function sendMessageToTab(tabId, payload) {
  return new Promise((resolve) => {
    const chromeApi = globalThis.chrome;
    const sendMessage = chromeApi?.tabs?.sendMessage;
    if (!sendMessage || !tabId) {
      resolve(null);
      return;
    }

    sendMessage.call(chromeApi.tabs, tabId, payload, (response) => {
      const runtimeError = chromeApi.runtime?.lastError;
      if (runtimeError) {
        console.debug("Message to tab failed", runtimeError.message);
        resolve(null);
        return;
      }

      resolve(response ?? null);
    });
  });
}

function renderPagePrices({ price, title }) {
  pagePriceStatus.textContent = "Price data detected";
  pagePriceTitle.textContent = title || "Current page";

  pagePriceValues.open.textContent = formatPrice(price.open);
  pagePriceValues.high.textContent = formatPrice(price.high);
  pagePriceValues.low.textContent = formatPrice(price.low);
  pagePriceValues.close.textContent = formatPrice(price.close);
  pagePriceValues.last.textContent = formatPrice(price.last);
}

const PAGE_PRICE_RETRY_LIMIT = 5;
const PAGE_PRICE_RETRY_DELAY_MS = 2000;
let pagePriceRetryTimer = null;

async function loadPagePrices({ attempt = 1, tabId } = {}) {
  if (pagePriceRetryTimer) {
    clearTimeout(pagePriceRetryTimer);
    pagePriceRetryTimer = null;
  }

  if (attempt === 1) {
    resetPagePrices("Checking active tab...");
  }

  const tab = tabId ? { id: tabId } : await queryActiveTab();
  if (!tab) {
    resetPagePrices("Open a tsetmc.com symbol page to view live prices.");
    return;
  }

  const tabHost = (() => {
    try {
      return new URL(tab.url ?? "").hostname;
    } catch (_error) {
      return "";
    }
  })();

  if (!tabHost.includes("tsetmc.com")) {
    resetPagePrices("Open a tsetmc.com symbol page to view live prices.");
    return;
  }

  const response = await sendMessageToTab(tab.id, { type: "SCRAPE_PAGE_PRICE" });
  if (response?.status === "ok") {
    renderPagePrices(response);
    pagePriceRetryTimer = null;
    return;
  }

  if (attempt < PAGE_PRICE_RETRY_LIMIT) {
    const attemptCopy = `Waiting for live price data (try ${attempt + 1} of ${PAGE_PRICE_RETRY_LIMIT})...`;
    pagePriceStatus.textContent = attemptCopy;
    pagePriceRetryTimer = setTimeout(
      () => loadPagePrices({ attempt: attempt + 1, tabId: tab.id }),
      PAGE_PRICE_RETRY_DELAY_MS
    );
    return;
  }

  resetPagePrices("No price data found on this page.");
  pagePriceRetryTimer = null;
}

async function loadCompanyList() {
  companyListEmpty.hidden = true;
  companyListLoading.hidden = false;
  companyList.innerHTML = "";

  try {
    await db.open();
    const records = await db.table(OHLC_TABLE).toArray();
    const latest = latestRecordsBySymbol(records);

    if (!latest.length) {
      companyListEmpty.hidden = false;
      return;
    }

    for (const record of latest) {
      const row = document.createElement("li");
      row.className = "company__item";

      const top = document.createElement("div");
      top.className = "company__top";

      const symbol = document.createElement("p");
      symbol.className = "company__symbol";
      symbol.textContent = record.symbol;
      top.appendChild(symbol);

      const date = document.createElement("p");
      date.className = "company__date";
      date.textContent = formatTradeDate(record);
      top.appendChild(date);

      row.appendChild(top);

      const prices = document.createElement("p");
      prices.className = "company__prices";
      prices.textContent = `O ${formatPrice(record.open)} | H ${formatPrice(record.high)} | L ${formatPrice(record.low)} | C ${formatPrice(record.close)} | Last ${formatPrice(record.last ?? record.close)}`;

      row.appendChild(prices);
      companyList.appendChild(row);
    }
  } catch (error) {
    console.error("Failed to load company list", error);
    companyListEmpty.textContent = "Could not load company prices.";
    companyListEmpty.hidden = false;
  } finally {
    companyListLoading.hidden = true;
  }
}

refreshSnapshot?.addEventListener("click", () => {
  loadSnapshot();
});

pagePriceRefresh?.addEventListener("click", () => {
  loadPagePrices();
});

companyListButton?.addEventListener("click", () => {
  loadCompanyList();
});

loadSnapshot();
loadPagePrices();
