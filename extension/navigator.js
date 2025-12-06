import { TabNavigator } from "./navigation/tabNavigator.js";
import { extractTopBoxSnapshotFromPage, extractSymbolsFromHtml } from "./parsing/price.js";
import { findSymbolsMissingToday, hasVisitedSnapshotForDate } from "./storage/selection.js";
import { saveSnapshotRecord } from "./storage/writes.js";
import { isWithinMarketLockWindow } from "./time.js";

const chromeApi = globalThis.chrome;

const POLL_INTERVAL_MS = 750;
const SCRAPE_TIMEOUT_MS = 8000;

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
  if (typeof url !== "string") return null;
  const match = url.match(/\/InstInfo\/([^/?#"'\s]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function buildPendingSymbolsSet(navigatorInstance) {
  const pending = new Set(normalizeSymbols(navigatorInstance?.queue || []));
  if (navigatorInstance?.activeSymbol) {
    pending.add(String(navigatorInstance.activeSymbol));
  }
  return pending;
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

async function extractTopBoxFromTab(tabId) {
  if (!chromeApi?.scripting?.executeScript || !tabId) return null;

  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: () => {
      const symbols = Array.from(document.querySelectorAll('a[href*="/instinfo/" i]'))
        .map((anchor) => anchor.getAttribute("href") || anchor.href)
        .map((href) => {
          const match = href?.match(/\/InstInfo\/([^/?#"'\s]+)/i);
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

async function pollForTopBox(
  tabId,
  { timeoutMs = SCRAPE_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS } = {}
) {
  const start = Date.now();
  let lastSnapshot = null;

  while (Date.now() - start < timeoutMs) {
    const snapshot = await extractTopBoxFromTab(tabId);
    const parsed = snapshot?.html ? extractTopBoxSnapshotFromPage(snapshot.html) : null;
    if (parsed) return { ...snapshot, parsed };
    lastSnapshot = snapshot;
    await sleep(intervalMs);
  }

  const parsed = lastSnapshot?.html ? extractTopBoxSnapshotFromPage(lastSnapshot.html) : null;
  return parsed ? { ...lastSnapshot, parsed } : lastSnapshot;
}

async function capturePriceAndLinks({ symbol, tabId, url }) {
  const snapshot = tabId ? await pollForTopBox(tabId) : null;

  const fallbackHtml = snapshot?.html ?? null;
  const parsedSnapshot =
    snapshot?.parsed ?? (fallbackHtml ? extractTopBoxSnapshotFromPage(fallbackHtml) : null);
  const linkedSymbols = snapshot?.symbols?.length
    ? snapshot.symbols
    : fallbackHtml
      ? extractSymbolsFromHtml(fallbackHtml)
      : [];

  if (parsedSnapshot) {
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
    } catch (error) {
      console.error("Failed to persist TopBox snapshot", error);
    }
  }

  return linkedSymbols;
}

const navigator = new TabNavigator({
  tabsApi: chromeApi?.tabs,
  onVisit: async ({ symbol, url, tabId }) => {
    console.debug("Visited symbol", { symbol, url });
    const symbols = await capturePriceAndLinks({ symbol, tabId, url });
    if (Array.isArray(symbols) && symbols.length) {
      navigator.enqueueSymbols(symbols);
    }

    await enqueueSymbolsMissingToday(navigator);
    navigator.start();
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

enqueueSymbolsMissingToday(navigator).then(() => navigator.start());

if (chromeApi?.tabs?.onUpdated?.addListener) {
  chromeApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo?.url || tab?.url;
    const status = changeInfo?.status;
    const symbol = detectSymbolFromUrl(url);

    if (!symbol) return;
    if (status && status !== "complete") return;

    const pending = buildPendingSymbolsSet(navigator);
    const isNavigatorTab = navigator.tabId !== null && navigator.tabId === tabId;
    const isNavigatorSymbol =
      symbol && (navigator.activeSymbol === symbol || navigator.lastVisitedSymbol === symbol);

    if (isNavigatorTab && isNavigatorSymbol) return;
    if (pending.has(symbol)) return;

    navigator.enqueueSymbols([symbol]);
    enqueueSymbolsMissingToday(navigator).finally(() => navigator.start());
  });
}

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return undefined;

    if (message.type === "NAVIGATE_SYMBOLS") {
      const symbols = normalizeSymbols(message.symbols || []);
      navigator.enqueueSymbols(symbols);
      enqueueSymbolsMissingToday(navigator).finally(() => navigator.start());
      sendResponse({ status: "queued", pending: navigator.pendingCount });
      return undefined;
    }

    if (message.type === "STOP_NAVIGATION") {
      navigator.stop();
      sendResponse({ status: "stopped" });
    }

    if (message.type === "NAVIGATION_STATE") {
      sendResponse(navigator.state());
    }

    if (message.type === "SAVE_PAGE_SNAPSHOT") {
      const symbol = detectSymbolFromUrl(message.url || message.symbol || "");
      const html = message.html || "";
      if (!symbol || typeof html !== "string" || !html.trim()) {
        sendResponse({ status: "ignored" });
        return undefined;
      }

      const snapshot = extractTopBoxSnapshotFromPage(html);
      if (!snapshot) {
        sendResponse({ status: "no_snapshot" });
        return undefined;
      }

      if (isWithinMarketLockWindow()) {
        sendResponse({ status: "locked" });
        return undefined;
      }

      saveSnapshotRecord({
        id: symbol,
        dateTime: new Date().toISOString(),
        ...snapshot,
      })
        .then(() => sendResponse({ status: "saved" }))
        .catch((error) => {
          console.error("Failed to persist page snapshot", error);
          sendResponse({ status: "error", error: error?.message || String(error) });
        });

      return true;
    }

    return undefined;
  });
}
