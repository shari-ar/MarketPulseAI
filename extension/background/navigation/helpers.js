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
async function executeInTab(tabId, func, args = []) {
  if (!chromeApi?.scripting?.executeScript) {
    throw new Error("Chrome scripting API unavailable");
  }

  // Chrome returns an array of execution results; we surface the first result for convenience.
  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
    func,
    args,
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
export async function navigateTo(tabId, url) {
  if (!chromeApi?.tabs?.update) {
    throw new Error("Chrome tabs API unavailable");
  }
  await chromeApi.tabs.update(tabId, { url });
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
      [selector]
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
export async function executeParser(tabId, parser, args = []) {
  return executeInTab(tabId, parser, args);
}
