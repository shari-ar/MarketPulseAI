import { executeParser } from "./helpers.js";

/**
 * Scrapes the active DOM for symbol identifiers and their canonical URLs.
 *
 * @returns {Array<{id: string, url?: string}>} Raw symbol entries found in the DOM.
 */
function extractSymbolsFromDom() {
  const ids = new Set();
  const urls = new Map();

  const addSymbol = (id, url) => {
    if (!id) return;
    ids.add(id);
    if (url) urls.set(id, url);
  };

  document.querySelectorAll("[data-symbol-id], [data-ins-code]").forEach((node) => {
    const id = node.getAttribute("data-symbol-id") || node.getAttribute("data-ins-code");
    addSymbol(id);
  });

  const linkSelector = 'a[href*="tsetmc.com/ins"], a[href*="/ins/?i="]';
  document.querySelectorAll(linkSelector).forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    const resolved = new URL(href, window.location.href);
    const id = resolved.searchParams.get("i");
    addSymbol(id, resolved.toString());
  });

  return Array.from(ids).map((id) => ({
    id,
    url: urls.get(id),
  }));
}

/**
 * Pulls symbol identifiers from the active tab so the crawler can sequence visits.
 *
 * @param {number} tabId - Chrome tab identifier to inspect.
 * @param {object} [options={}] - Optional instrumentation overrides.
 * @param {import("../logger.js").LoggingService} [options.logger] - Structured logger.
 * @param {Date} [options.now=new Date()] - Clock used for deterministic tests.
 * @returns {Promise<Array<{id: string, url?: string}>>} Normalized symbol list.
 */
export async function collectSymbolsFromTab(tabId, { logger, now = new Date() } = {}) {
  const symbols = await executeParser(tabId, extractSymbolsFromDom);
  const normalized = Array.isArray(symbols) ? symbols.filter((symbol) => symbol?.id) : [];
  logger?.log({
    type: "debug",
    message: "Collected symbols from active tab",
    source: "navigator",
    context: { tabId, count: normalized.length },
    now,
  });
  return normalized;
}
