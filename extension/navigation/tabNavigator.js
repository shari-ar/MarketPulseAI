const DEFAULT_DELAY_MS = 500;
const DEFAULT_LOAD_TIMEOUT_MS = 15000;
const DEFAULT_BASE_URL = "https://www.tsetmc.com/instInfo/";

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
    onProgress = () => {},
  } = {}) {
    this.tabsApi = tabsApi;
    this.baseUrl = baseUrl;
    this.delayMs = delayMs;
    this.loadTimeoutMs = loadTimeoutMs;
    this.reuseTab = reuseTab;
    this.onVisit = onVisit;
    this.onProgress = onProgress;

    this.queue = [];
    this.running = false;
    this.tabId = null;
    this.activeSymbol = null;
    this.lastVisitedSymbol = null;
    this._timer = null;
    this._idleResolvers = [];
    this.totalCount = 0;
    this.completedCount = 0;
  }

  enqueueSymbols(symbols = []) {
    const unique = normalizeSymbols(symbols);
    this.queue.push(...unique);
    if (this.running) {
      this.totalCount += unique.length;
    } else {
      this.totalCount = this.queue.length;
    }
  }

  replaceQueue(symbols = []) {
    this.queue = normalizeSymbols(symbols);
    this.totalCount = this.queue.length;
    this.completedCount = 0;
  }

  stop() {
    this.running = false;
    this.activeSymbol = null;
    this.lastVisitedSymbol = null;
    this.completedCount = 0;
    this.totalCount = this.queue.length;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._notifyIdle();
  }

  async start() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    this.completedCount = 0;
    this.totalCount = this.queue.length;
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
      lastVisitedSymbol: this.lastVisitedSymbol,
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
    let tab = null;

    try {
      tab = await this._visitSymbol(symbol);
      await this.onVisit({
        symbol,
        tabId: tab?.id ?? null,
        url: buildSymbolUrl(symbol, this.baseUrl),
      });
    } catch (error) {
      console.error("tab navigation failed", error);
    }

    this.completedCount += 1;
    this.lastVisitedSymbol = symbol;
    this._reportProgress({ symbol, tabId: tab?.id ?? null });

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

  _reportProgress({ symbol, tabId }) {
    if (typeof this.onProgress !== "function") return;

    const total = Math.max(this.totalCount, this.completedCount + this.queue.length);

    this.onProgress({
      symbol,
      tabId,
      completed: this.completedCount,
      remaining: this.queue.length,
      total,
    });
  }
}

export default TabNavigator;
