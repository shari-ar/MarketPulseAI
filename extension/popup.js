import db from "./storage/db.js";
import { DB_VERSION } from "./storage/schema.js";
import { formatMarketClock, isBeforeMarketClose, currentMarketTimestamp } from "./time.js";

const message = document.getElementById("message");
const ping = document.getElementById("ping");
const lockBanner = document.getElementById("lock-banner");
const lockTag = document.getElementById("lock-tag");
const marketClock = document.getElementById("market-clock");
const lockCopy = document.getElementById("lock-copy");

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
