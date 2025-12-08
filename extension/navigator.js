import { TabNavigator } from "./navigation/tabNavigator.js";
import { missingSnapshotFields, hasCompleteSnapshot } from "./navigation/snapshotFields.js";
import { extractInstInfoSymbol } from "./inst-info.js";
import { extractTopBoxSnapshotFromPage, extractSymbolsFromHtml } from "./parsing/price.js";
import { findSymbolsMissingToday, hasVisitedSnapshotForDate } from "./storage/selection.js";
import { saveSnapshotRecord } from "./storage/writes.js";
import { isWithinMarketLockWindow } from "./time.js";
import { GLOBAL_STATUS, isValidGlobalStatus } from "./status-bus.js";
import { triggerImmediateAnalysis } from "./analysis/immediate-analyzer.js";

const chromeApi = globalThis.chrome;

const MAX_CAPTURE_ATTEMPTS = 10;
const CAPTURE_RETRY_DELAY_MS = 1000;

const statusRecord = {
  value: GLOBAL_STATUS.IDLE,
  updatedAt: new Date().toISOString(),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSymbols(symbols = []) {
  return symbols
    .filter(Boolean)
    .map((symbol) => String(symbol).trim())
    .filter(Boolean);
}

function detectSymbolFromUrl(url) {
  return extractInstInfoSymbol(url);
}

function broadcastStatusChange(status) {
  if (!chromeApi?.runtime?.sendMessage) return;

  try {
    chromeApi.runtime.sendMessage({ type: "GLOBAL_STATUS_CHANGE", status });
  } catch (error) {
    console.debug("Failed to broadcast status change", error);
  }
}

function setGlobalStatus(status, { source = "navigation" } = {}) {
  if (!isValidGlobalStatus(status)) return statusRecord;

  if (statusRecord.value === status) return statusRecord;

  statusRecord.value = status;
  statusRecord.updatedAt = new Date().toISOString();
  statusRecord.source = source;

  broadcastStatusChange({ ...statusRecord });
  return statusRecord;
}

function getGlobalStatus() {
  return { ...statusRecord };
}

function summarizeMissingFields(missing = []) {
  if (!missing.length) return `Required fields never loaded after ${MAX_CAPTURE_ATTEMPTS} attempts`;

  const summary = `Missing fields after ${MAX_CAPTURE_ATTEMPTS} attempts`;
  const detailedList = missing.join(", ");

  return `${summary}:\n${detailedList}`;
}

function dispatchErrorToast(tabId, { title, subtitle }) {
  if (tabId && chromeApi?.tabs?.sendMessage) {
    chromeApi.tabs.sendMessage(tabId, { type: "COLLECTION_ERROR", title, subtitle }, () => {
      const runtimeError = chromeApi.runtime?.lastError;
      if (runtimeError) {
        console.debug("Error toast dispatch skipped", runtimeError.message);
      }
    });
  }
}

function buildPendingSymbolsSet(navigatorInstance) {
  const pending = new Set(normalizeSymbols(navigatorInstance?.queue || []));
  if (navigatorInstance?.activeSymbol) {
    pending.add(String(navigatorInstance.activeSymbol));
  }
  return pending;
}

async function filterSymbolsNotVisitedToday(symbols = [], navigatorInstance) {
  const pending = buildPendingSymbolsSet(navigatorInstance);
  const normalized = normalizeSymbols(symbols).filter((symbol) => !pending.has(symbol));
  if (!normalized.length) return [];

  const checks = await Promise.all(
    normalized.map(async (symbol) => ({ symbol, visited: await hasVisitedSnapshotForDate(symbol) }))
  );

  return checks.filter(({ visited }) => !visited).map(({ symbol }) => symbol);
}

async function queueSymbolsForToday(symbols = [], navigatorInstance) {
  const toQueue = await filterSymbolsNotVisitedToday(symbols, navigatorInstance);
  if (toQueue.length) {
    navigatorInstance.enqueueSymbols(toQueue);
  }
  return toQueue;
}

async function enqueueSymbolsMissingToday(navigatorInstance) {
  const missingToday = normalizeSymbols(await findSymbolsMissingToday());
  if (!missingToday.length) return 0;

  const pending = buildPendingSymbolsSet(navigatorInstance);
  const toQueue = missingToday.filter((symbol) => !pending.has(symbol));
  if (toQueue.length) {
    navigatorInstance.enqueueSymbols(toQueue);
  }

  return toQueue.length;
}

function updateNavigationStatus({ remaining, pendingCount }) {
  const hasWork = Number.isFinite(remaining)
    ? remaining > 0
    : Number.isFinite(pendingCount)
      ? pendingCount > 0
      : false;
  const nextStatus = hasWork ? GLOBAL_STATUS.COLLECTING : GLOBAL_STATUS.IDLE;
  setGlobalStatus(nextStatus);
}

async function extractTopBoxFromTab(tabId) {
  if (!chromeApi?.scripting?.executeScript || !tabId) return null;

  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: () => {
      const symbols = Array.from(document.querySelectorAll('a[href*="/instinfo/" i]'))
        .map((anchor) => anchor.getAttribute("href") || anchor.href)
        .map((href) => {
          const match = href?.match(/\/instInfo\/([^/?#"'\s]+)(?=[/?#]|$)/i);
          return match ? decodeURIComponent(match[1]) : null;
        })
        .filter(Boolean);

      return {
        symbols,
        html: document.documentElement?.outerHTML ?? "",
      };
    },
    world: "MAIN",
  });

  return result?.result ?? null;
}

async function capturePriceAndLinks({ symbol, tabId, url }) {
  let attempt = 0;
  let parsedSnapshot = null;
  let linkedSymbols = [];

  while (attempt < MAX_CAPTURE_ATTEMPTS) {
    attempt += 1;
    const snapshot = tabId ? await extractTopBoxFromTab(tabId) : null;

    const fallbackHtml = snapshot?.html ?? null;
    parsedSnapshot = fallbackHtml ? extractTopBoxSnapshotFromPage(fallbackHtml) : null;
    linkedSymbols = snapshot?.symbols?.length
      ? snapshot.symbols
      : fallbackHtml
        ? extractSymbolsFromHtml(fallbackHtml)
        : [];

    const hasCompleteData = hasCompleteSnapshot(parsedSnapshot);
    const hasLinks = Array.isArray(linkedSymbols) && linkedSymbols.length > 0;

    if (hasCompleteData && hasLinks) {
      break;
    }

    await sleep(CAPTURE_RETRY_DELAY_MS);
  }

  const hasCompleteData = hasCompleteSnapshot(parsedSnapshot);
  const missingFields = missingSnapshotFields(parsedSnapshot);
  const hasLinks = Array.isArray(linkedSymbols) && linkedSymbols.length > 0;

  if (!hasCompleteData) {
    dispatchErrorToast(tabId, {
      title: "Missing stock details",
      subtitle: summarizeMissingFields(missingFields),
    });
    throw new Error("Failed to capture complete stock information");
  }

  if (!hasLinks) {
    dispatchErrorToast(tabId, {
      title: "No linked symbols found",
      subtitle: "Could not discover any related symbols after 10 attempts",
    });
    throw new Error("Failed to discover related symbols");
  }

  const alreadyCapturedToday = symbol ? await hasVisitedSnapshotForDate(symbol) : false;

  if (alreadyCapturedToday) {
    console.info("Skipping save; symbol already captured today", { symbol, url });
    return linkedSymbols;
  }

  if (isWithinMarketLockWindow()) {
    console.info("Write skipped during market lock window", { symbol, url });
    return linkedSymbols;
  }

  try {
    await saveSnapshotRecord({
      id: symbol,
      dateTime: new Date().toISOString(),
      ...parsedSnapshot,
    });
    console.info("Saved TopBox snapshot", { symbol, url });
    triggerImmediateAnalysis().catch((error) =>
      console.warn("Immediate analysis trigger failed", error)
    );
  } catch (error) {
    console.error("Failed to persist TopBox snapshot", error);
  }

  return linkedSymbols;
}

const navigator = new TabNavigator({
  tabsApi: chromeApi?.tabs,
  onVisit: async ({ symbol, url, tabId }) => {
    console.debug("Visited symbol", { symbol, url });
    try {
      const symbols = await capturePriceAndLinks({ symbol, tabId, url });
      if (Array.isArray(symbols) && symbols.length) {
        await queueSymbolsForToday(symbols, navigator);
      }

      await enqueueSymbolsMissingToday(navigator);
      startNavigationIfQueued();
    } catch (error) {
      console.error("Navigation halted due to capture failure", error);
      navigator.stop();
      setGlobalStatus(GLOBAL_STATUS.IDLE);
      throw error;
    }
  },
  onProgress: ({ symbol, tabId, completed, total, remaining }) => {
    const summary = total > 0 ? `${completed}/${total}` : `${completed}`;
    const payload = {
      type: "COLLECTION_PROGRESS",
      symbol,
      completed,
      total,
      remaining,
      summary,
    };

    updateNavigationStatus({ remaining, pendingCount: navigator.pendingCount });

    console.info(`MarketPulseAI collection progress ${summary}`, {
      symbol,
      remaining,
      total,
    });

    if (tabId && chromeApi?.tabs?.sendMessage) {
      chromeApi.tabs.sendMessage(tabId, payload, () => {
        const runtimeError = chromeApi.runtime?.lastError;
        if (runtimeError) {
          console.debug("Toast dispatch skipped", runtimeError.message);
        }
      });
    }
  },
});

function startNavigationIfQueued() {
  if (navigator.pendingCount > 0 || navigator.queue?.length > 0) {
    setGlobalStatus(GLOBAL_STATUS.COLLECTING);
  } else {
    setGlobalStatus(GLOBAL_STATUS.IDLE);
  }
  navigator.start();
}

enqueueSymbolsMissingToday(navigator).then(() => startNavigationIfQueued());

if (chromeApi?.tabs?.onUpdated?.addListener) {
  chromeApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo?.url || tab?.url;
    const status = changeInfo?.status;
    const symbol = detectSymbolFromUrl(url);
    const hasUrlChange = Boolean(changeInfo?.url);
    const isCompleteStatus = status === "complete" || typeof status === "undefined";

    if (!symbol) return;
    if (!hasUrlChange && !isCompleteStatus) return;

    const pending = buildPendingSymbolsSet(navigator);
    const isNavigatorTab = navigator.tabId !== null && navigator.tabId === tabId;
    const isNavigatorSymbol =
      symbol && (navigator.activeSymbol === symbol || navigator.lastVisitedSymbol === symbol);

    if (isNavigatorTab && isNavigatorSymbol) return;
    if (pending.has(symbol)) return;

    queueSymbolsForToday([symbol], navigator)
      .then(() => enqueueSymbolsMissingToday(navigator))
      .finally(() => startNavigationIfQueued());
  });
}

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return undefined;

    if (message.type === "NAVIGATE_SYMBOLS") {
      const symbols = normalizeSymbols(message.symbols || []);
      queueSymbolsForToday(symbols, navigator)
        .then(() => enqueueSymbolsMissingToday(navigator))
        .then(() => {
          startNavigationIfQueued();
          sendResponse({ status: "queued", pending: navigator.pendingCount });
        })
        .catch((error) => {
          console.error("Failed to queue navigation symbols", error);
          sendResponse({ status: "error", error: error?.message || String(error) });
        });

      return true;
    }

    if (message.type === "STOP_NAVIGATION") {
      navigator.stop();
      setGlobalStatus(GLOBAL_STATUS.IDLE);
      sendResponse({ status: "stopped" });
    }

    if (message.type === "NAVIGATION_STATE") {
      sendResponse(navigator.state());
    }

    if (message.type === "GLOBAL_STATUS") {
      sendResponse(getGlobalStatus());
    }

    if (message.type === "SET_GLOBAL_STATUS") {
      const updated = setGlobalStatus(message.status, { source: message.source });
      sendResponse(updated);
    }

    if (message.type === "SAVE_PAGE_SNAPSHOT") {
      const symbol = detectSymbolFromUrl(message.url || message.symbol || "");
      const html = message.html || "";
      const symbolsFromMessage = normalizeSymbols(message.symbols || []);

      if (!symbol || typeof html !== "string" || !html.trim()) {
        sendResponse({ status: "ignored" });
        return undefined;
      }

      const snapshot = extractTopBoxSnapshotFromPage(html);
      if (!snapshot) {
        sendResponse({ status: "no_snapshot" });
        return undefined;
      }

      const respondWithNavigation = async (payload) => {
        try {
          if (symbolsFromMessage.length) {
            await queueSymbolsForToday(symbolsFromMessage, navigator);
          }
          await enqueueSymbolsMissingToday(navigator);
          startNavigationIfQueued();
        } catch (error) {
          console.error("Failed to enqueue symbols after snapshot", error);
        }

        sendResponse(payload);
      };

      return hasVisitedSnapshotForDate(symbol)
        .then((visited) => {
          if (visited) {
            return respondWithNavigation({ status: "already_saved" });
          }

          if (isWithinMarketLockWindow()) {
            return respondWithNavigation({ status: "locked" });
          }

          return saveSnapshotRecord({
            id: symbol,
            dateTime: new Date().toISOString(),
            ...snapshot,
          })
            .then(() =>
              Promise.resolve(triggerImmediateAnalysis())
                .catch((error) => console.warn("Immediate analysis trigger failed", error))
                .then(() => respondWithNavigation({ status: "saved" }))
            )
            .catch((error) => {
              console.error("Failed to persist page snapshot", error);
              sendResponse({ status: "error", error: error?.message || String(error) });
            });
        })
        .catch((error) => {
          console.error("Failed to handle snapshot save", error);
          sendResponse({ status: "error", error: error?.message || String(error) });
        });
    }

    return undefined;
  });
}
