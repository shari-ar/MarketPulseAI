import { TabNavigator } from "./navigation/tabNavigator.js";
import { extractPriceInfoFromPage, extractSymbolsFromHtml } from "./parsing/price.js";
import { saveOhlcRecord } from "./storage/writes.js";
import { currentMarketDate } from "./time.js";

const chromeApi = globalThis.chrome;

const POLL_INTERVAL_MS = 750;
const SCRAPE_TIMEOUT_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractTopBoxFromTab(tabId) {
  if (!chromeApi?.scripting?.executeScript || !tabId) return null;

  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
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
      const lastText = container.querySelector("#d02")?.textContent ?? null;

      let rangeLow = null;
      let rangeHigh = null;

      const rangeLabel = Array.from(container.querySelectorAll("td")).find((cell) =>
        cell.textContent?.includes("بازه روز")
      );

      if (rangeLabel?.parentElement) {
        const values = Array.from(rangeLabel.parentElement.querySelectorAll("div"))
          .map((node) => parseNum(node.textContent))
          .filter((num) => num !== null);

        if (values.length >= 2) {
          [rangeLow, rangeHigh] = values;
        } else if (values.length === 1) {
          rangeLow = rangeHigh = values[0];
        }
      }

      const payload = {
        open: parseNum(openText),
        close: parseNum(closeText),
        last: parseNum(lastText),
        low: rangeLow,
        high: rangeHigh,
      };

      const hasAny = Object.values(payload).some((value) => Number.isFinite(value));

      const symbols = Array.from(document.querySelectorAll('a[href*="/InstInfo/"]'))
        .map((anchor) => anchor.getAttribute("href") || anchor.href)
        .map((href) => {
          const match = href?.match(/\/InstInfo\/([^/?#"'\s]+)/i);
          return match ? decodeURIComponent(match[1]) : null;
        })
        .filter(Boolean);

      return {
        price: hasAny ? payload : null,
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
    if (snapshot?.price) return snapshot;
    lastSnapshot = snapshot;
    await sleep(intervalMs);
  }

  return lastSnapshot;
}

async function capturePriceAndLinks({ symbol, tabId, url }) {
  const snapshot = tabId ? await pollForTopBox(tabId) : null;

  const fallbackHtml = snapshot?.html ?? null;
  const parsedPrice =
    snapshot?.price ?? (fallbackHtml ? extractPriceInfoFromPage(fallbackHtml) : null);
  const linkedSymbols = snapshot?.symbols?.length
    ? snapshot.symbols
    : fallbackHtml
      ? extractSymbolsFromHtml(fallbackHtml)
      : [];

  if (
    parsedPrice &&
    [parsedPrice.open, parsedPrice.high, parsedPrice.low, parsedPrice.close].every(Number.isFinite)
  ) {
    try {
      await saveOhlcRecord({
        symbol,
        tradeDate: currentMarketDate(),
        open: parsedPrice.open,
        high: parsedPrice.high,
        low: parsedPrice.low,
        close: parsedPrice.close,
        collectedAt: new Date().toISOString(),
      });
      console.info("Saved OHLC from page", { symbol, url });
    } catch (error) {
      console.error("Failed to persist OHLC", error);
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

function normalizeSymbols(symbols = []) {
  return symbols
    .filter(Boolean)
    .map((symbol) => String(symbol).trim())
    .filter(Boolean);
}

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return undefined;

    if (message.type === "NAVIGATE_SYMBOLS") {
      const symbols = normalizeSymbols(message.symbols || []);
      navigator.enqueueSymbols(symbols);
      navigator.start();
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

    return undefined;
  });
}
