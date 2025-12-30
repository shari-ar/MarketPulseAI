import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../../runtime-config.js";
import { shouldCollect } from "../scheduling.js";
import { navigateTo, waitForSelector, executeParser } from "./helpers.js";
import { DEFAULT_SELECTORS, parseTopBoxSnapshot } from "../parsing/top-box.js";
import { SNAPSHOT_FIELDS } from "../../storage/schema.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a symbol-specific URL from config templates or a precomputed URL.
 *
 * @param {{id: string, url?: string}} symbol - Symbol descriptor.
 * @param {object} config - Runtime configuration.
 * @returns {string|null} Resolved URL or null when unavailable.
 */
function buildUrl(symbol, config) {
  if (!symbol) return null;
  if (symbol.url) return symbol.url;
  const template = config.SYMBOL_URL_TEMPLATE;
  return template.replace("{symbol}", encodeURIComponent(symbol.id));
}

/**
 * Ensures every snapshot includes all schema keys to simplify downstream handling.
 *
 * @param {object} snapshot - Raw parser output.
 * @returns {object} Snapshot aligned with schema defaults.
 */
function withSnapshotDefaults(snapshot) {
  const base = Object.fromEntries(Object.keys(SNAPSHOT_FIELDS).map((key) => [key, null]));
  return { ...base, ...snapshot };
}

/**
 * Visits the symbol page, waits for readiness, and parses the snapshot payload.
 *
 * @param {object} params - Crawl parameters.
 * @param {number} params.tabId - Target tab id.
 * @param {{id: string, url?: string}} params.symbol - Symbol descriptor.
 * @param {object} params.config - Runtime configuration.
 * @param {AbortSignal} params.signal - Abort signal for cancellation.
 * @param {import("../logger.js").LoggingService} [params.logger] - Structured logger.
 * @returns {Promise<object>} Parsed snapshot with schema defaults.
 */
async function attemptParse({ tabId, symbol, config, signal, logger }) {
  const url = buildUrl(symbol, config);
  if (!url) {
    logger?.log({
      type: "warning",
      message: "Missing symbol URL; skipping snapshot",
      source: "navigator",
      context: { symbol: symbol?.id },
      now: new Date(),
    });
    throw new Error("Missing symbol URL");
  }

  logger?.log({
    type: "debug",
    message: "Resolved symbol URL",
    source: "navigator",
    context: { symbol: symbol.id, url },
    now: new Date(),
  });
  logger?.log({
    type: "debug",
    message: "Using navigation selectors",
    source: "navigator",
    context: {
      readySelector: config.NAVIGATION_READY_SELECTOR,
      pollingMs: config.NAVIGATION_POLL_INTERVAL_MS,
      timeoutMs: config.NAVIGATION_WAIT_TIMEOUT_MS,
    },
    now: new Date(),
  });

  const now = new Date();
  logger?.log({
    type: "debug",
    message: "Navigating to symbol page",
    source: "navigator",
    context: { symbol: symbol.id, url },
    now,
  });
  await navigateTo(tabId, url, { logger, now });
  logger?.log({
    type: "debug",
    message: "Navigation requested",
    source: "navigator",
    context: { symbol: symbol.id, tabId },
    now,
  });
  await waitForSelector(tabId, config.NAVIGATION_READY_SELECTOR, {
    timeoutMs: config.NAVIGATION_WAIT_TIMEOUT_MS,
    pollIntervalMs: config.NAVIGATION_POLL_INTERVAL_MS,
    signal,
    logger,
    now,
  });
  logger?.log({
    type: "debug",
    message: "Navigation readiness confirmed",
    source: "navigator",
    context: { symbol: symbol.id, selector: config.NAVIGATION_READY_SELECTOR },
    now,
  });

  // Stamp a shared timestamp so downstream processing stays in sync.
  const nowIso = now.toISOString();
  const parsed = await executeParser(
    tabId,
    parseTopBoxSnapshot,
    [
      {
        selectors: config.PARSING_SELECTORS,
        symbol: symbol.id,
        nowIso,
      },
    ],
    { logger, now }
  );
  logger?.log({
    type: "debug",
    message: "Parser executed for symbol",
    source: "navigator",
    context: { symbol: symbol.id, hasResult: Boolean(parsed) },
    now: new Date(),
  });

  logger?.log({
    type: "debug",
    message: "Parsed snapshot payload",
    source: "navigator",
    context: { symbol: parsed?.id || symbol.id },
    now: new Date(),
  });
  const normalized = withSnapshotDefaults({
    ...parsed,
    id: parsed?.id || symbol.id,
    dateTime: nowIso,
  });
  logger?.log({
    type: "debug",
    message: "Normalized snapshot",
    source: "navigator",
    context: { symbol: normalized?.id, dateTime: normalized?.dateTime },
    now: new Date(),
  });
  logger?.log({
    type: "debug",
    message: "Applied snapshot defaults",
    source: "navigator",
    context: { symbol: normalized?.id },
    now: new Date(),
  });
  return normalized;
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
  logger?.log({
    type: "debug",
    message: "Initialized crawler config",
    source: "navigator",
    context: {
      tabId,
      retryLimit: runtimeConfig.NAVIGATION_RETRY_LIMIT,
      readySelector: runtimeConfig.NAVIGATION_READY_SELECTOR,
      selectorsConfigured: Object.keys(runtimeConfig.PARSING_SELECTORS || {}).length,
    },
    now: new Date(),
  });
  if (!symbols.length) {
    logger?.log({
      type: "debug",
      message: "No symbols queued for crawl",
      source: "navigator",
      context: { tabId },
      now: new Date(),
    });
    return;
  }
  const queue = symbols.slice();
  const retryQueue = [];
  logger?.log({
    type: "debug",
    message: "Prepared crawl queues",
    source: "navigator",
    context: { queued: queue.length, retries: retryQueue.length },
    now: new Date(),
  });
  logger?.log({
    type: "info",
    message: "Starting symbol crawl",
    source: "navigator",
    context: {
      tabId,
      queuedSymbols: queue.length,
      retryLimit: runtimeConfig.NAVIGATION_RETRY_LIMIT,
    },
    now: new Date(),
  });
  logger?.log({
    type: "debug",
    message: "Entering crawl loop",
    source: "navigator",
    context: { queued: queue.length },
    now: new Date(),
  });

  while (queue.length) {
    if (signal?.aborted) throw new Error("Crawl aborted");
    const now = new Date();
    logger?.log({
      type: "debug",
      message: "Evaluating collection window during crawl",
      source: "navigator",
      context: { timestamp: now.toISOString() },
      now,
    });
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
    logger?.log({
      type: "debug",
      message: "Dequeued symbol for crawl",
      source: "navigator",
      context: { symbol: symbol?.id, remaining: queue.length },
      now,
    });
    logger?.log({
      type: "debug",
      message: "Attempting parse for symbol",
      source: "navigator",
      context: { symbol: symbol?.id },
      now,
    });
    try {
      const snapshot = await attemptParse({
        tabId,
        symbol,
        config: runtimeConfig,
        signal,
        logger,
      });
      if (snapshot && snapshot.id) {
        await onSnapshot?.(snapshot);
        logger?.log({
          type: "info",
          message: "Captured symbol snapshot",
          source: "navigator",
          context: { symbol: snapshot.id },
          now,
        });
        logger?.log({
          type: "debug",
          message: "Snapshot emitted to handler",
          source: "navigator",
          context: { symbol: snapshot.id, dateTime: snapshot.dateTime },
          now,
        });
        logger?.log({
          type: "debug",
          message: "Snapshot parsing completed",
          source: "navigator",
          context: { symbol: snapshot.id },
          now,
        });
      } else {
        logger?.log({
          type: "debug",
          message: "No snapshot emitted for symbol",
          source: "navigator",
          context: { symbol: symbol?.id },
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
      logger?.log({
        type: "debug",
        message: "Queued symbol for retry",
        source: "navigator",
        context: { symbol: symbol?.id, retryQueueSize: retryQueue.length + 1 },
        now: new Date(),
      });
      retryQueue.push(symbol);
    }
  }

  if (!retryQueue.length) {
    logger?.log({
      type: "debug",
      message: "Crawl completed without retries",
      source: "navigator",
      context: { tabId },
      now: new Date(),
    });
    return;
  }

  // Retry failures in bounded passes to avoid infinite loops on unstable symbols.
  const retries = runtimeConfig.NAVIGATION_RETRY_LIMIT;
  const retryDelayMs = runtimeConfig.NAVIGATION_RETRY_DELAY_MS;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (signal?.aborted) throw new Error("Crawl aborted");
    logger?.log({
      type: "debug",
      message: "Preparing retry batch",
      source: "navigator",
      context: { attempt: attempt + 1, queued: retryQueue.length },
      now: new Date(),
    });
    logger?.log({
      type: "debug",
      message: "Starting crawl retry pass",
      source: "navigator",
      context: { attempt: attempt + 1, remaining: retryQueue.length },
      now: new Date(),
    });
    const remaining = retryQueue.splice(0, retryQueue.length);
    logger?.log({
      type: "debug",
      message: "Retry batch prepared",
      source: "navigator",
      context: { attempt: attempt + 1, batchSize: remaining.length },
      now: new Date(),
    });
    for (const symbol of remaining) {
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }
      try {
        const snapshot = await attemptParse({
          tabId,
          symbol,
          config: runtimeConfig,
          signal,
          logger,
        });
        if (snapshot && snapshot.id) {
          await onSnapshot?.(snapshot);
          logger?.log({
            type: "info",
            message: "Captured symbol snapshot after retry",
            source: "navigator",
            context: { symbol: snapshot.id, attempt: attempt + 1 },
            now: new Date(),
          });
          logger?.log({
            type: "debug",
            message: "Retry snapshot emitted to handler",
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

    logger?.log({
      type: "debug",
      message: "Retry pass completed",
      source: "navigator",
      context: { attempt: attempt + 1, remaining: retryQueue.length },
      now: new Date(),
    });
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
