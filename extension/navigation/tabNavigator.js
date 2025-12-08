const DEFAULT_DELAY_MS = 500;
const DEFAULT_LOAD_TIMEOUT_MS = 15000;
const DEFAULT_BASE_URL = "https://www.tsetmc.com/instInfo/";
const DEFAULT_ALARM_NAME = "marketpulseai_tabnavigator_tick";

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

function replaceSymbolInUrl(currentUrl, symbol, baseUrl = DEFAULT_BASE_URL) {
  if (typeof currentUrl === "string" && currentUrl.trim()) {
    const encoded = encodeURIComponent(symbol);
    const hasInstInfo = /\/instInfo\/[^/?#"'\s]+(?=[/?#]|$)/i.test(currentUrl);
    if (hasInstInfo) {
      return currentUrl.replace(/(\/instInfo\/)([^/?#"'\s]+)(?=[/?#]|$)/i, `$1${encoded}`);
    }
  }

  return buildSymbolUrl(symbol, baseUrl);
}

export class TabNavigator {
  constructor({
    tabsApi = globalThis.chrome?.tabs,
    alarmsApi = globalThis.chrome?.alarms,
    baseUrl = DEFAULT_BASE_URL,
    delayMs = DEFAULT_DELAY_MS,
    loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
    reuseTab = true,
    onVisit = () => {},
    onProgress = () => {},
    onError = null,
  } = {}) {
    this.tabsApi = tabsApi;
    this.alarmsApi = alarmsApi;
    this.baseUrl = baseUrl;
    this.delayMs = delayMs;
    this.loadTimeoutMs = loadTimeoutMs;
    this.reuseTab = reuseTab;
    this.onVisit = onVisit;
    this.onProgress = onProgress;
    this.onError = onError;

    this.queue = [];
    this.running = false;
    this.tabId = null;
    this.activeSymbol = null;
    this.lastVisitedSymbol = null;
    this._timer = null;
    this._alarmName = DEFAULT_ALARM_NAME;
    this._onAlarm = (alarm) => {
      if (!alarm || alarm.name !== this._alarmName) return;
      this._clearSchedule();
      this._processQueue();
    };
    this._processing = false;
    this._idleResolvers = [];
    this.totalCount = 0;
    this.completedCount = 0;

    if (this.alarmsApi?.onAlarm?.addListener) {
      this.alarmsApi.onAlarm.addListener(this._onAlarm);
    }
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
    this._clearSchedule();
    this._clearAlarm();
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
    if (this._processing) return;
    this._processing = true;
    this._clearSchedule();

    if (!this.running) {
      this._processing = false;
      this._notifyIdle();
      return;
    }

    const symbol = this.queue.shift();
    if (!symbol) {
      this.running = false;
      this._processing = false;
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
      this._handleError(error, { symbol });
    }

    this.completedCount += 1;
    this.lastVisitedSymbol = symbol;
    this._reportProgress({ symbol, tabId: tab?.id ?? null });

    if (!this.running || this.queue.length === 0) {
      this.running = this.queue.length > 0;
      this.activeSymbol = null;
      this._processing = false;
      this._notifyIdle();
      return;
    }

    this._processing = false;
    this._scheduleNextTick();
  }

  async _visitSymbol(symbol) {
    const url = buildSymbolUrl(symbol, this.baseUrl);
    const tab = await this._createOrReuseTab(symbol, url);
    if (!tab?.id) {
      return tab;
    }
    await this._waitForTabComplete(tab.id);
    return tab;
  }

  async _createOrReuseTab(symbol, url) {
    if (!this.tabsApi) {
      throw new Error("Tabs API not available");
    }

    if (this.reuseTab && this.tabId !== null) {
      let existingTab = null;
      try {
        existingTab = await createTabsPromise(this.tabsApi, "get", this.tabId);
      } catch (_error) {
        /* reuse falls back to create below */
      }

      const nextUrl = replaceSymbolInUrl(existingTab?.url, symbol, this.baseUrl);

      return createTabsPromise(this.tabsApi, "update", this.tabId, {
        url: nextUrl,
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

  _clearSchedule() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _clearAlarm() {
    if (this.alarmsApi?.clear) {
      try {
        this.alarmsApi.clear(this._alarmName, () => {});
      } catch (error) {
        console.debug("Failed to clear navigation alarm", error);
      }
    }
  }

  _scheduleNextTick() {
    this._clearSchedule();
    this._clearAlarm();

    if (this.alarmsApi?.create) {
      try {
        this.alarmsApi.create(this._alarmName, { when: Date.now() + this.delayMs });
      } catch (error) {
        console.debug("Failed to schedule navigation alarm", error);
      }
    }

    this._timer = setTimeout(() => {
      this._clearAlarm();
      this._processQueue();
    }, this.delayMs);
  }

  _notifyIdle() {
    if (this.running || this.queue.length > 0) {
      return;
    }

    this._clearSchedule();

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

  _handleError(error, context) {
    if (typeof this.onError === "function") {
      try {
        this.onError(error, context);
        return;
      } catch (handlerError) {
        console.error("tab navigation error handler failed", handlerError);
      }
    }

    console.error("tab navigation failed", error, context);
  }
}

export default TabNavigator;
