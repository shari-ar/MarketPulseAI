import { TabNavigator as ImportedTabNavigator } from "./navigation/tabNavigator.js";

const chromeApi = globalThis?.chrome ?? globalThis?.browser ?? null;

async function createNavigator() {
  const TabNavigator = globalThis.TabNavigator ?? ImportedTabNavigator ?? null;
  if (!TabNavigator) {
    console.error("TabNavigator unavailable; navigation disabled");
    return null;
  }

  return new TabNavigator({
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
}

const navigatorReady = createNavigator();

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
      navigatorReady.then((activeNavigator) => {
        if (!activeNavigator) {
          sendResponse({ status: "unavailable" });
          return;
        }

        const symbols = normalizeSymbols(message.symbols || []);
        activeNavigator.enqueueSymbols(symbols);
        activeNavigator.start();
        sendResponse({ status: "queued", pending: activeNavigator.pendingCount });
      });
      return true;
    }

    if (message.type === "STOP_NAVIGATION") {
      navigatorReady.then((activeNavigator) => {
        if (!activeNavigator) {
          sendResponse({ status: "unavailable" });
          return;
        }

        activeNavigator.stop();
        sendResponse({ status: "stopped" });
      });
      return true;
    }

    if (message.type === "NAVIGATION_STATE") {
      navigatorReady.then((activeNavigator) => {
        if (!activeNavigator) {
          sendResponse({ status: "unavailable" });
          return;
        }

        sendResponse(activeNavigator.state());
      });
      return true;
    }

    return undefined;
  });
}
