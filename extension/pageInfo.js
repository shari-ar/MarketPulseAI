import { chromeApi } from "./vendor/chromeApi.js";

(() => {
  let priceModulePromise;

  async function loadPriceModule() {
    if (!priceModulePromise) {
      const moduleUrl = chromeApi?.runtime?.getURL?.("parsing/price.js") ?? "./parsing/price.js";
      priceModulePromise = import(moduleUrl);
    }

    return priceModulePromise;
  }

  async function readPagePrice() {
    const nextData = document.getElementById("__NEXT_DATA__");
    const source = nextData?.textContent ?? document?.documentElement?.innerHTML ?? "";
    const { extractPriceInfoFromPage } = await loadPriceModule();
    const price = extractPriceInfoFromPage(source);
    const title = document?.title ?? "";

    if (!price) return null;

    return {
      title,
      price,
    };
  }

  if (chromeApi?.runtime?.onMessage) {
    chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message?.type) return undefined;

      if (message.type === "SCRAPE_PAGE_PRICE") {
        readPagePrice()
          .then((payload) => {
            sendResponse(payload ? { status: "ok", ...payload } : { status: "empty" });
          })
          .catch((error) => {
            sendResponse({ status: "error", message: error?.message ?? "Unknown error" });
          });

        return true;
      }

      return undefined;
    });
  }
})();
