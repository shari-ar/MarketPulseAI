import db from "./storage/db.js";
import { DB_VERSION, OHLC_TABLE } from "./storage/schema.js";
import { summarizeRecords } from "./storage/snapshots.js";
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
  message.textContent = `IndexedDB v${DB_VERSION} ready (tables: ${tableNames || "none"})`;
});

function formatPrice(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "—";
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

refreshSnapshot?.addEventListener("click", () => {
  loadSnapshot();
});

loadSnapshot();
