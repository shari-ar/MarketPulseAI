import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../../runtime-config.js";
import { shouldCollect } from "../scheduling.js";
import { navigateTo, waitForSelector, executeParser } from "./helpers.js";
import { DEFAULT_SELECTORS, parseTopBoxSnapshot } from "../parsing/top-box.js";
import { SNAPSHOT_FIELDS } from "../../storage/schema.js";

function buildUrl(symbol, config) {
  if (!symbol) return null;
  if (symbol.url) return symbol.url;
  const template = config.SYMBOL_URL_TEMPLATE;
  return template.replace("{symbol}", encodeURIComponent(symbol.id));
}

function withSnapshotDefaults(snapshot) {
  const base = Object.fromEntries(Object.keys(SNAPSHOT_FIELDS).map((key) => [key, null]));
  return { ...base, ...snapshot };
}

async function attemptParse({ tabId, symbol, config, signal }) {
  const url = buildUrl(symbol, config);
  if (!url) throw new Error("Missing symbol URL");

  await navigateTo(tabId, url);
  await waitForSelector(tabId, config.NAVIGATION_READY_SELECTOR, {
    timeoutMs: config.NAVIGATION_WAIT_TIMEOUT_MS,
    pollIntervalMs: config.NAVIGATION_POLL_INTERVAL_MS,
    signal,
  });

  const nowIso = new Date().toISOString();
  const parsed = await executeParser(tabId, parseTopBoxSnapshot, [
    {
      selectors: config.PARSING_SELECTORS,
      symbol: symbol.id,
      nowIso,
    },
  ]);

  return withSnapshotDefaults({ ...parsed, id: parsed?.id || symbol.id, dateTime: nowIso });
}

/**
 * Sequentially crawls symbol pages, retries failures, and emits sanitized snapshots.
 */
export async function crawlSymbols({
  tabId,
  symbols = [],
  config = DEFAULT_RUNTIME_CONFIG,
  logger,
  signal,
  onSnapshot,
} = {}) {
  const runtimeConfig = buildCrawlerConfig(config);
  const queue = symbols.slice();
  const retryQueue = [];

  while (queue.length) {
    if (signal?.aborted) throw new Error("Crawl aborted");
    const now = new Date();
    if (!shouldCollect(now, runtimeConfig)) {
      logger?.log({
        type: "info",
        message: "Crawl paused outside collection window",
        source: "navigator",
        context: { timestamp: now.toISOString() },
        now,
      });
      return;
    }

    const symbol = queue.shift();
    try {
      const snapshot = await attemptParse({ tabId, symbol, config: runtimeConfig, signal });
      if (snapshot && snapshot.id) {
        await onSnapshot?.(snapshot);
        logger?.log({
          type: "info",
          message: "Captured symbol snapshot",
          source: "navigator",
          context: { symbol: snapshot.id },
          now,
        });
      }
    } catch (error) {
      logger?.log({
        type: "warning",
        message: "Symbol crawl failed; queued for retry",
        source: "navigator",
        context: { symbol: symbol?.id, error: error?.message },
        now: new Date(),
      });
      retryQueue.push(symbol);
    }
  }

  if (!retryQueue.length) return;

  const retries = runtimeConfig.NAVIGATION_RETRY_LIMIT;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (signal?.aborted) throw new Error("Crawl aborted");
    const remaining = retryQueue.splice(0, retryQueue.length);
    for (const symbol of remaining) {
      try {
        const snapshot = await attemptParse({ tabId, symbol, config: runtimeConfig, signal });
        if (snapshot && snapshot.id) {
          await onSnapshot?.(snapshot);
          logger?.log({
            type: "info",
            message: "Captured symbol snapshot after retry",
            source: "navigator",
            context: { symbol: snapshot.id, attempt: attempt + 1 },
            now: new Date(),
          });
        }
      } catch (error) {
        retryQueue.push(symbol);
        logger?.log({
          type: "warning",
          message: "Retry crawl failed",
          source: "navigator",
          context: { symbol: symbol?.id, attempt: attempt + 1, error: error?.message },
          now: new Date(),
        });
      }
    }

    if (!retryQueue.length) return;
  }

  logger?.log({
    type: "warning",
    message: "Crawl completed with unresolved symbols",
    source: "navigator",
    context: { remaining: retryQueue.map((symbol) => symbol?.id) },
    now: new Date(),
  });
}

export function buildCrawlerConfig(config = DEFAULT_RUNTIME_CONFIG) {
  const runtimeConfig = getRuntimeConfig(config);
  return {
    ...runtimeConfig,
    NAVIGATION_READY_SELECTOR: runtimeConfig.NAVIGATION_READY_SELECTOR || "body",
    PARSING_SELECTORS: runtimeConfig.PARSING_SELECTORS || DEFAULT_SELECTORS,
  };
}
