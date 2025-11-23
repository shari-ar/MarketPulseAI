import { extractPriceInfoFromPage } from "./parsing/price.js";

const chromeApi = globalThis.chrome;

function readPagePrice() {
  const nextData = document.getElementById("__NEXT_DATA__");
  const source = nextData?.textContent ?? document?.documentElement?.innerHTML ?? "";
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
      const payload = readPagePrice();
      sendResponse(payload ? { status: "ok", ...payload } : { status: "empty" });
    }

    return undefined;
  });
}
