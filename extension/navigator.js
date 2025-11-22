import { TabNavigator } from "./navigation/tabNavigator.js";

const chromeApi = globalThis.chrome;

const navigator = new TabNavigator({
  tabsApi: chromeApi?.tabs,
  onVisit: ({ symbol, url }) => {
    console.debug("Visited symbol", { symbol, url });
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
      return true;
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
