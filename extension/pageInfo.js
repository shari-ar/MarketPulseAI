import { extractPriceInfoFromPage } from "./parsing/price.js";

const chromeApi = globalThis.chrome;

function readPagePrice() {
  const html = document?.documentElement?.innerHTML ?? "";
  const price = extractPriceInfoFromPage(html);
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
      const payload = readPagePrice();
      sendResponse(payload ? { status: "ok", ...payload } : { status: "empty" });
    }

    return undefined;
  });
}
