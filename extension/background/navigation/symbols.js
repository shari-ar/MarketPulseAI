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

  // Prefer explicit data attributes when available since they are more stable than link scraping.
  document.querySelectorAll("[data-symbol-id], [data-ins-code]").forEach((node) => {
    const id = node.getAttribute("data-symbol-id") || node.getAttribute("data-ins-code");
    addSymbol(id);
  });

  const linkSelector = 'a[href*="tsetmc.com/instInfo/"], a[href*="/instInfo/"]';
  document.querySelectorAll(linkSelector).forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    const resolved = new URL(href, window.location.href);
    const id = resolved.pathname.match(/\/instInfo\/(\d+)/)?.[1];
    addSymbol(id, resolved.toString());
  });

  const currentPathId = new URL(window.location.href).pathname.match(/\/instInfo\/(\d+)/)?.[1];
  if (currentPathId) {
    addSymbol(currentPathId, window.location.href);
  }

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
export async function collectSymbolsFromTab(tabId, { logger, now = new Date(), config } = {}) {
  let symbols = [];
  const retryLimit = config?.NAVIGATION_RETRY_LIMIT ?? 1;
  const retryDelayMs = config?.NAVIGATION_RETRY_DELAY_MS ?? 0;
  logger?.log({
    type: "debug",
    message: "Collecting symbols from tab",
    source: "navigator",
    context: { tabId, retryLimit, retryDelayMs },
    now,
  });
  try {
    symbols = await executeParser(tabId, extractSymbolsFromDom, [], {
      logger,
      now,
      label: "symbol-extraction",
      retries: retryLimit,
      retryDelayMs,
      validateResult: (result) => Array.isArray(result) && result.length > 0,
    });
    logger?.log({
      type: "debug",
      message: "Executed symbol extraction parser",
      source: "navigator",
      context: { tabId, rawCount: Array.isArray(symbols) ? symbols.length : 0 },
      now,
    });
  } catch (error) {
    logger?.log({
      type: "warning",
      message: "Failed to collect symbols from tab",
      source: "navigator",
      context: { tabId, error: error?.message },
      now,
    });
    return [];
  }
  const normalized = Array.isArray(symbols) ? symbols.filter((symbol) => symbol?.id) : [];
  const withUrls = normalized.filter((symbol) => symbol?.url).length;
  logger?.log({
    type: "debug",
    message: "Normalized collected symbols",
    source: "navigator",
    context: { tabId, rawCount: Array.isArray(symbols) ? symbols.length : 0 },
    now,
  });
  logger?.log({
    type: "debug",
    message: "Captured symbol URL coverage",
    source: "navigator",
    context: { tabId, urlCount: withUrls, total: normalized.length },
    now,
  });
  logger?.log({
    type: "debug",
    message: "Collected symbols from active tab",
    source: "navigator",
    context: { tabId, count: normalized.length },
    now,
  });
  if (!normalized.length) {
    logger?.log({
      type: "debug",
      message: "No symbols returned from tab parser",
      source: "navigator",
      context: { tabId },
      now,
    });
  }
  return normalized;
}
