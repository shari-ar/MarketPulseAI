const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

/**
 * Pause execution for a fixed amount of time.
 *
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>} Resolves once the timer completes.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a function inside the target tab context.
 *
 * @param {number} tabId - Chrome tab identifier.
 * @param {Function} func - Function to run in the tab.
 * @param {Array} [args=[]] - Arguments for the injected function.
 * @returns {Promise<*>} Result returned from the injected function.
 */
async function executeInTab(tabId, func, args = [], { logger, now = new Date(), label } = {}) {
  if (!chromeApi?.scripting?.executeScript) {
    logger?.log?.({
      type: "debug",
      message: "Chrome scripting API unavailable",
      source: "navigator",
      context: { tabId, label },
      now,
    });
    throw new Error("Chrome scripting API unavailable");
  }

  logger?.log?.({
    type: "debug",
    message: "Executing script in tab",
    source: "navigator",
    context: { tabId, label },
    now,
  });

  // Chrome returns an array of execution results; we surface the first result for convenience.
  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  logger?.log?.({
    type: "debug",
    message: "Script executed in tab",
    source: "navigator",
    context: { tabId, label, hasResult: result?.result !== undefined },
    now,
  });
  return result?.result;
}

/**
 * Navigates the target tab to a new URL.
 *
 * @param {number} tabId - Chrome tab identifier.
 * @param {string} url - Destination URL.
 * @returns {Promise<void>} Resolves after the navigation request is issued.
 */
export async function navigateTo(tabId, url, { logger, now = new Date() } = {}) {
  if (!chromeApi?.tabs?.update) {
    throw new Error("Chrome tabs API unavailable");
  }
  logger?.log?.({
    type: "debug",
    message: "Navigating tab to URL",
    source: "navigator",
    context: { tabId, url },
    now,
  });
  await chromeApi.tabs.update(tabId, { url });
  logger?.log?.({
    type: "debug",
    message: "Tab navigation issued",
    source: "navigator",
    context: { tabId, url },
    now,
  });
}

/**
 * Reads the current URL for a tab.
 *
 * @param {number} tabId - Chrome tab identifier.
 * @returns {Promise<string|null>} URL string or null if unavailable.
 */
export async function getTabUrl(tabId, { logger, now = new Date() } = {}) {
  if (!chromeApi?.tabs?.get) {
    throw new Error("Chrome tabs API unavailable");
  }
  logger?.log?.({
    type: "debug",
    message: "Fetching tab URL",
    source: "navigator",
    context: { tabId },
    now,
  });
  const tab = await chromeApi.tabs.get(tabId);
  const url = tab?.url ?? null;
  logger?.log?.({
    type: "debug",
    message: "Fetched tab URL",
    source: "navigator",
    context: { tabId, hasUrl: Boolean(url) },
    now,
  });
  return url;
}

/**
 * Waits until a selector exists in the tab DOM or the timeout elapses.
 *
 * @param {number} tabId - Chrome tab identifier.
 * @param {string} selector - DOM selector to await.
 * @param {object} [options] - Timing and instrumentation options.
 * @param {number} [options.timeoutMs=15000] - Max time to wait.
 * @param {number} [options.pollIntervalMs=250] - Polling interval.
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation.
 * @param {import("../logger.js").LoggingService} [options.logger] - Structured logger.
 * @param {Date} [options.now=new Date()] - Clock used for deterministic tests.
 * @returns {Promise<boolean>} True when the selector is found.
 */
export async function waitForSelector(
  tabId,
  selector,
  { timeoutMs = 15000, pollIntervalMs = 250, signal, logger, now = new Date() } = {}
) {
  const startedAt = Date.now();
  logger?.log({
    type: "debug",
    message: "Waiting for selector",
    source: "navigator",
    context: { tabId, selector, timeoutMs },
    now,
  });

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new Error("Navigation aborted");
    const found = await executeInTab(
      tabId,
      (targetSelector) => {
        return Boolean(document.querySelector(targetSelector));
      },
      [selector],
      { logger, now, label: "selector-check" }
    );
    if (found) {
      logger?.log({
        type: "debug",
        message: "Selector ready",
        source: "navigator",
        context: { tabId, selector, durationMs: Date.now() - startedAt },
        now,
      });
      return true;
    }
    logger?.log({
      type: "debug",
      message: "Selector not yet available",
      source: "navigator",
      context: { tabId, selector, elapsedMs: Date.now() - startedAt },
      now,
    });
    await sleep(pollIntervalMs);
  }
  logger?.log({
    type: "warning",
    message: "Selector wait timed out",
    source: "navigator",
    context: { tabId, selector, timeoutMs },
    now: new Date(),
  });
  throw new Error(`Selector timeout: ${selector}`);
}

/**
 * Executes a parser function against the active tab DOM.
 *
 * @param {number} tabId - Chrome tab identifier.
 * @param {Function} parser - Parser function to execute.
 * @param {Array} [args=[]] - Arguments passed to the parser.
 * @returns {Promise<*>} Parsed result from the tab.
 */
export async function executeParser(
  tabId,
  parser,
  args = [],
  { logger, now = new Date(), label = "parser", retries = 1, retryDelayMs = 0, validateResult } = {}
) {
  const defaultValidateResult = (result) => {
    if (result === null || result === undefined) return false;
    if (Array.isArray(result)) return result.length > 0;
    if (typeof result === "object") return Object.keys(result).length > 0;
    return true;
  };
  const normalizeValidation = (validation) => {
    if (typeof validation === "object" && validation !== null) {
      return {
        valid: Boolean(validation.valid),
        reason: validation.reason ?? null,
        details: validation.details ?? null,
      };
    }
    return { valid: Boolean(validation), reason: null, details: null };
  };
  const runValidation = validateResult ?? defaultValidateResult;

  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    logger?.log?.({
      type: "debug",
      message: "Executing parser in tab",
      source: "navigator",
      context: { tabId, label, attempt: attempt + 1, retries },
      now,
    });
    try {
      const result = await executeInTab(tabId, parser, args, {
        logger,
        now,
        label,
      });
      logger?.log?.({
        type: "debug",
        message: "Executed parser in tab",
        source: "navigator",
        context: {
          tabId,
          label,
          attempt: attempt + 1,
          resultCount: Array.isArray(result) ? result.length : null,
        },
        now,
      });
      const validation = normalizeValidation(runValidation(result));
      if (validation.valid) {
        return result;
      }
      const detailSummary =
        validation.details && Object.keys(validation.details).length
          ? ` details=${JSON.stringify(validation.details)}`
          : "";
      const reasonSummary = validation.reason ? ` reason=${validation.reason}` : "";
      logger?.log?.({
        type: "debug",
        message: `Parser result incomplete; retrying.${reasonSummary}${detailSummary}`,
        source: "navigator",
        context: {
          tabId,
          label,
          attempt: attempt + 1,
          reason: validation.reason,
          details: validation.details,
        },
        now,
      });
      lastError = new Error(validation.reason || "Parser result incomplete");
    } catch (error) {
      lastError = error;
      const errorDetails = error?.details ? ` details=${JSON.stringify(error.details)}` : "";
      const errorSummary = error?.message ? ` reason=${error.message}` : "";
      logger?.log?.({
        type: "warning",
        message: `Parser execution failed.${errorSummary}${errorDetails}`,
        source: "navigator",
        context: { tabId, label, attempt: attempt + 1, error: error?.message },
        now,
      });
    }

    if (attempt < retries - 1 && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  throw lastError || new Error("Parser failed after retries");
}
