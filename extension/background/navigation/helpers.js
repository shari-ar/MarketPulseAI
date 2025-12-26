const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeInTab(tabId, func, args = []) {
  if (!chromeApi?.scripting?.executeScript) {
    throw new Error("Chrome scripting API unavailable");
  }

  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return result?.result;
}

export async function navigateTo(tabId, url) {
  if (!chromeApi?.tabs?.update) {
    throw new Error("Chrome tabs API unavailable");
  }
  await chromeApi.tabs.update(tabId, { url });
}

export async function waitForSelector(
  tabId,
  selector,
  { timeoutMs = 15000, pollIntervalMs = 250, signal } = {}
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new Error("Navigation aborted");
    const found = await executeInTab(
      tabId,
      (targetSelector) => {
        return Boolean(document.querySelector(targetSelector));
      },
      [selector]
    );
    if (found) return true;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Selector timeout: ${selector}`);
}

export async function executeParser(tabId, parser, args = []) {
  return executeInTab(tabId, parser, args);
}
