const DEFAULT_DELAY_MS = 500;
const DEFAULT_LOAD_TIMEOUT_MS = 15000;
const DEFAULT_BASE_URL = "https://www.tsetmc.com/InstInfo/";

function normalizeSymbols(symbols = []) {
  return Array.from(
    new Set(
      symbols
        .filter(Boolean)
        .map((symbol) => String(symbol).trim())
        .filter(Boolean)
    )
  );
}

function createTabsPromise(tabsApi, method, ...args) {
  if (!tabsApi || typeof tabsApi[method] !== "function") {
    return Promise.reject(new Error("Tabs API is unavailable"));
  }

  return new Promise((resolve, reject) => {
    try {
      const maybePromise = tabsApi[method](...args, (result) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
        } else {
          resolve(result);
        }
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve).catch(reject);
      } else if (tabsApi[method].length === args.length) {
        resolve(maybePromise);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function buildSymbolUrl(symbol, baseUrl = DEFAULT_BASE_URL) {
  const encoded = encodeURIComponent(symbol);
  return `${baseUrl}${encoded}`;
}

export class TabNavigator {
  constructor({
    tabsApi = globalThis.chrome?.tabs,
    baseUrl = DEFAULT_BASE_URL,
    delayMs = DEFAULT_DELAY_MS,
    loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
    reuseTab = true,
    onVisit = () => {},
  } = {}) {
    this.tabsApi = tabsApi;
    this.baseUrl = baseUrl;
    this.delayMs = delayMs;
    this.loadTimeoutMs = loadTimeoutMs;
    this.reuseTab = reuseTab;
    this.onVisit = onVisit;

    this.queue = [];
    this.running = false;
    this.tabId = null;
    this.activeSymbol = null;
    this._timer = null;
    this._idleResolvers = [];
  }

  enqueueSymbols(symbols = []) {
    const unique = normalizeSymbols(symbols);
    this.queue.push(...unique);
  }

  replaceQueue(symbols = []) {
    this.queue = normalizeSymbols(symbols);
  }

  stop() {
    this.running = false;
    this.activeSymbol = null;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._notifyIdle();
  }

  async start() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    await this._processQueue();
  }

  get pendingCount() {
    return this.queue.length;
  }

  state() {
    return {
      running: this.running,
      pending: [...this.queue],
      tabId: this.tabId,
      activeSymbol: this.activeSymbol,
    };
  }

  whenIdle() {
    if (!this.running && this.queue.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this._idleResolvers.push(resolve);
    });
  }

  async _processQueue() {
    if (!this.running) {
      this._notifyIdle();
      return;
    }

    const symbol = this.queue.shift();
    if (!symbol) {
      this.running = false;
      this._notifyIdle();
      return;
    }

    this.activeSymbol = symbol;

    try {
      const tab = await this._visitSymbol(symbol);
      await this.onVisit({
        symbol,
        tabId: tab?.id ?? null,
        url: buildSymbolUrl(symbol, this.baseUrl),
      });
    } catch (error) {
      console.error("tab navigation failed", error);
    }

    if (!this.running || this.queue.length === 0) {
      this.running = this.queue.length > 0;
      this.activeSymbol = null;
      this._notifyIdle();
      return;
    }

    this._timer = setTimeout(() => this._processQueue(), this.delayMs);
  }

  async _visitSymbol(symbol) {
    const url = buildSymbolUrl(symbol, this.baseUrl);
    const tab = await this._createOrReuseTab(url);
    if (!tab?.id) {
      return tab;
    }
    await this._waitForTabComplete(tab.id);
    return tab;
  }

  async _createOrReuseTab(url) {
    if (!this.tabsApi) {
      throw new Error("Tabs API not available");
    }

    if (this.reuseTab && this.tabId !== null) {
      return createTabsPromise(this.tabsApi, "update", this.tabId, {
        url,
        active: false,
      });
    }

    const created = await createTabsPromise(this.tabsApi, "create", { url, active: false });
    this.tabId = created?.id ?? null;
    return created;
  }

  _waitForTabComplete(tabId) {
    const onUpdated = this.tabsApi?.onUpdated;
    if (!onUpdated?.addListener) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let completed = false;
      const timeout = setTimeout(() => {
        completed = true;
        onUpdated.removeListener(listener);
        resolve();
      }, this.loadTimeoutMs);

      const listener = (updatedTabId, changeInfo, tab) => {
        if (completed) return;
        if (updatedTabId === tabId && changeInfo?.status === "complete") {
          completed = true;
          clearTimeout(timeout);
          onUpdated.removeListener(listener);
          resolve(tab);
        }
      };

      onUpdated.addListener(listener);
    });
  }

  _notifyIdle() {
    if (this.running || this.queue.length > 0) {
      return;
    }

    while (this._idleResolvers.length) {
      const resolve = this._idleResolvers.shift();
      resolve();
    }
  }
}

export default TabNavigator;
