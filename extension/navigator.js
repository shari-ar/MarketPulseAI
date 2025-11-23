import { TabNavigator } from "./navigation/tabNavigator.js";
const chromeApi = globalThis?.chrome ?? globalThis?.browser ?? null;

const navigator = new TabNavigator({
  tabsApi: chromeApi?.tabs,
  onVisit: ({ symbol, url }) => {
    console.debug("Visited symbol", { symbol, url });
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
