import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../runtime-config.js";
import { shouldCollect, shouldPause, shouldRunAnalysis } from "./scheduling.js";
import { getDelayUntilMarketTime, marketDateFromIso } from "./time.js";
import { pruneSnapshots } from "../storage/retention.js";
import { validateSnapshot } from "../storage/schema.js";
import { storageLogger } from "../storage/logger.js";
import { runSwingAnalysisWithWorker } from "../analysis/runner.js";
import { LoggingService, loggingService as sharedLogger } from "./logger.js";
import { storageAdapter } from "../storage/adapter.js";
import { crawlSymbols } from "./navigation/crawler.js";
import { collectSymbolsFromTab } from "./navigation/symbols.js";
import { initializeRuntimeSettings } from "./settings.js";

const chromeApi = typeof globalThis !== "undefined" ? globalThis.chrome : undefined;
const MARKET_HOST_PATTERN = /^https?:\/\/(?:[^./]+\.)*tsetmc\.com\//i;

/**
 * Central stateful controller for orchestrating snapshot collection, log retention,
 * and triggering swing analysis once the crawl is complete or deadlines are reached.
 */
export class NavigatorService {
  constructor({
    config = DEFAULT_RUNTIME_CONFIG,
    logger = sharedLogger,
    storage = storageAdapter,
  } = {}) {
    this.config = getRuntimeConfig(config);
    this.logger = logger instanceof LoggingService ? logger : new LoggingService({ config });
    this.storage = storage;
    this.snapshots = [];
    this.expectedSymbols = new Set();
    this.symbolQueue = [];
    this.crawlComplete = false;
    this.analysisResult = null;
    this.analysisCache = new Map();
    this.lastPruneDate = null;
    this.activeTabId = null;
    this.analysisRunning = false;
    this.crawlController = null;
    this.crawlTask = null;
    this.hydrating = this.hydrateFromStorage();
    this.closeTimer = null;
    this.deadlineTimer = null;
    this.symbolRefresh = null;
  }

  get logs() {
    return this.logger.getLogs();
  }

  clearTimers() {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.closeTimer = null;
    this.deadlineTimer = null;
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG, now = new Date()) {
    this.config = getRuntimeConfig(config);
    this.logger.updateConfig?.(this.config);
    this.storage?.updateConfig?.(this.config);
    this.logger.log({
      type: "info",
      message: "Runtime config updated",
      source: "navigator",
      context: { schedule: { ...this.config } },
      now,
    });
    if (this.activeTabId !== null) {
      this.scheduleDailyTasks(now);
    }
  }

  scheduleDailyTasks(now = new Date()) {
    this.clearTimers();
    const closeDelay = getDelayUntilMarketTime(now, this.config.MARKET_CLOSE, this.config, {
      requireTradingDay: true,
    });
    const deadlineDelay = getDelayUntilMarketTime(now, this.config.ANALYSIS_DEADLINE, this.config, {
      requireTradingDay: true,
    });

    if (closeDelay !== null) {
      this.closeTimer = setTimeout(() => this.handleMarketClose(), closeDelay);
    }
    if (deadlineDelay !== null) {
      this.deadlineTimer = setTimeout(() => this.handleAnalysisDeadline(), deadlineDelay);
    }

    this.logger.log({
      type: "debug",
      message: "Scheduled market timers",
      source: "navigator",
      context: {
        closeInMs: closeDelay,
        deadlineInMs: deadlineDelay,
        closeAt: closeDelay !== null ? new Date(now.getTime() + closeDelay).toISOString() : null,
        deadlineAt:
          deadlineDelay !== null ? new Date(now.getTime() + deadlineDelay).toISOString() : null,
      },
      now,
    });
  }

  haltCrawl(reason = "manual-stop", now = new Date()) {
    const wasActive = Boolean(this.crawlController || this.crawlTask);
    if (!wasActive) return;
    if (this.crawlController) this.crawlController.abort();
    this.crawlController = null;
    this.crawlTask = null;
    this.logger.log({
      type: "info",
      message: "Crawl halted",
      source: "navigator",
      context: { reason },
      now,
    });
  }

  handleMarketClose(now = new Date()) {
    this.logger.log({
      type: "info",
      message: "Market close reached; starting daily retention sweep",
      source: "navigator",
      context: { timestamp: now.toISOString() },
      now,
    });
    this.pruneRetention(now);
    if (this.activeTabId !== null && shouldCollect(now, this.config)) {
      this.startCrawl();
    }
    this.scheduleDailyTasks(now);
  }

  async handleAnalysisDeadline(now = new Date()) {
    this.logger.log({
      type: "info",
      message: "Analysis deadline reached; stopping crawl and running analysis",
      source: "navigator",
      context: { timestamp: now.toISOString() },
      now,
    });
    this.haltCrawl("analysis-deadline", now);
    this.crawlComplete = true;
    await this.runAnalysisIfDue(now, "deadline");
    this.scheduleDailyTasks(now);
  }

  /**
   * Seeds the expected symbol set to track completion status across a crawl cycle.
   *
   * @param {Array<string|{id: string, url?: string}>} symbols - Symbols anticipated from the collector.
   */
  planSymbols(symbols = [], now = new Date()) {
    const normalized = symbols
      .map((entry) => (typeof entry === "string" ? { id: entry } : entry))
      .filter((entry) => entry?.id);
    const marketDate = marketDateFromIso(now.toISOString(), this.config);
    const latestBySymbol = new Map();
    this.snapshots.forEach((snapshot) => {
      if (!snapshot?.id || !snapshot?.dateTime) return;
      const existing = latestBySymbol.get(snapshot.id);
      if (!existing || new Date(snapshot.dateTime) > new Date(existing)) {
        latestBySymbol.set(snapshot.id, snapshot.dateTime);
      }
    });
    const missing = normalized.filter((entry) => {
      const latest = latestBySymbol.get(entry.id);
      return !latest || marketDateFromIso(latest, this.config) !== marketDate;
    });

    missing.sort((a, b) => {
      const aTime = latestBySymbol.get(a.id);
      const bTime = latestBySymbol.get(b.id);
      if (!aTime && !bTime) return 0;
      if (!aTime) return -1;
      if (!bTime) return 1;
      return new Date(aTime) - new Date(bTime);
    });

    this.expectedSymbols = new Set(missing.map((entry) => String(entry.id)));
    this.symbolQueue = missing;
    this.crawlComplete = this.expectedSymbols.size === 0;
    this.logger.log({
      type: "info",
      message: "Planned symbol crawl",
      context: {
        expectedCount: this.expectedSymbols.size,
        marketDate,
      },
      source: "navigator",
    });
    if (this.activeTabId !== null && shouldCollect(new Date(), this.config)) this.startCrawl();
  }

  async refreshSymbolPlan(now = new Date()) {
    if (this.symbolRefresh || this.activeTabId === null) return;
    this.logger.log({
      type: "debug",
      message: "Refreshing symbol plan",
      source: "navigator",
      context: { tabId: this.activeTabId },
      now,
    });
    this.symbolRefresh = collectSymbolsFromTab(this.activeTabId, {
      logger: this.logger,
      now,
    })
      .then((symbols) => {
        if (!symbols.length) {
          this.logger.log({
            type: "warning",
            message: "No symbols detected on page",
            source: "navigator",
            context: { tabId: this.activeTabId },
            now,
          });
          return;
        }
        this.planSymbols(symbols, now);
      })
      .catch((error) => {
        this.logger.log({
          type: "warning",
          message: "Failed to collect symbol list",
          source: "navigator",
          context: { error: error?.message, tabId: this.activeTabId },
          now,
        });
      })
      .finally(() => {
        this.symbolRefresh = null;
      });
    await this.symbolRefresh;
  }

  /**
   * Determines whether a symbol already has data captured for a specific market date.
   *
   * @param {string} symbol - Symbol identifier.
   * @param {string} marketDate - Trading date in YYYY-MM-DD format.
   * @returns {boolean} True when a snapshot already exists for that day.
   */
  hasSnapshotForDay(symbol, marketDate) {
    return this.snapshots.some(
      (entry) =>
        entry.id === symbol && marketDateFromIso(entry.dateTime, this.config) === marketDate
    );
  }

  /**
   * Performs retention sweeps for snapshots and logs, ensuring work starts
   * with a clean slate when entering the collection window each day.
   *
   * @param {Date} now - Current clock used for deterministic testing.
   * @returns {string|null} Market date used for pruning decisions.
   */
  pruneRetention(now) {
    const marketDate = marketDateFromIso(now.toISOString(), this.config);
    if (this.lastPruneDate === marketDate) return marketDate;

    const snapshotCountBefore = this.snapshots.length;
    const logCountBefore = this.logs.length;

    this.snapshots = pruneSnapshots(this.snapshots, {
      now,
      retentionDays: this.config.RETENTION_DAYS,
      logger: storageLogger,
      config: this.config,
    });
    this.storage?.pruneSnapshots?.(now).catch((error) =>
      this.logger.log({
        type: "warning",
        message: "Failed to prune persisted snapshots",
        source: "navigator",
        context: { error: error?.message },
        now,
      })
    );
    this.logger.prune(now);
    this.lastPruneDate = marketDate;

    this.logger.log({
      type: "info",
      message: "Pruned retention windows",
      source: "navigator",
      context: {
        prunedSnapshots: snapshotCountBefore - this.snapshots.length,
        prunedLogs: logCountBefore - this.logs.length,
        marketDate,
      },
      now,
    });

    return marketDate;
  }

  updateAnalysisStatus(status, now = new Date()) {
    if (!chromeApi?.storage?.local?.set) return;
    chromeApi.storage.local.set({ analysisStatus: { ...status, updatedAt: now.toISOString() } });
  }

  async runAnalysisIfDue(now = new Date(), reason = "scheduled") {
    if (this.analysisRunning) {
      this.logger.log({
        type: "info",
        message: "Analysis already running",
        source: "navigator",
        context: { reason },
        now,
      });
      return;
    }

    if (!shouldRunAnalysis({ now, crawlComplete: this.crawlComplete, config: this.config })) {
      return;
    }

    this.analysisRunning = true;
    this.updateAnalysisStatus({ state: "running", progress: 0, reason }, now);

    try {
      this.analysisResult = await runSwingAnalysisWithWorker({
        snapshots: this.snapshots,
        analysisCache: this.analysisCache,
        now,
        onProgress: (progress) =>
          this.updateAnalysisStatus({ state: "running", progress, reason }, now),
      });

      this.snapshots = this.analysisResult.snapshots;
      this.analysisResult.analyzedSymbols.forEach((symbol) => {
        if (symbol) this.analysisCache.set(symbol, this.analysisResult.analyzedAt);
      });
      this.persistAnalysisOutputs();

      this.logger.log({
        type: "info",
        message: "Triggered swing analysis",
        source: "navigator",
        context: {
          snapshotCount: this.snapshots.length,
          rankedCount: this.analysisResult?.ranked?.length ?? 0,
        },
        now,
      });
      this.updateAnalysisStatus({ state: "complete", progress: 1, reason }, now);
    } catch (error) {
      this.logger.log({
        type: "error",
        message: "Swing analysis failed",
        source: "navigator",
        context: { error: error?.message },
        now,
      });
      this.updateAnalysisStatus({
        state: "error",
        progress: 0,
        reason,
        error: error?.message,
      });
    } finally {
      this.analysisRunning = false;
    }
  }

  /**
   * Validates and stores incoming snapshots while enforcing blackout windows,
   * pruning retention windows, and kicking off analysis when criteria are met.
   *
   * @param {import("../storage/schema.js").Snapshot[]} records - Candidate snapshots.
   * @param {Date} now - Timestamp used for schedule checks.
   * @returns {Promise<{accepted: string[]}>} Set of symbol ids accepted into storage.
   */
  async recordSnapshots(records = [], now = new Date()) {
    if (shouldPause(now, this.config)) {
      this.logger.log({
        type: "info",
        message: "Skip collection during blackout window",
        source: "navigator",
        context: { timestamp: now.toISOString() },
        now,
      });
      return { accepted: [] };
    }

    if (!shouldCollect(now, this.config)) {
      this.logger.log({
        type: "info",
        message: "Outside collection window",
        source: "navigator",
        context: { timestamp: now.toISOString() },
        now,
      });
      await this.runAnalysisIfDue(now, "deadline");
      return { accepted: [] };
    }

    const marketDate = this.pruneRetention(now);

    const accepted = [];
    const acceptedSnapshots = [];

    records.forEach((snapshot) => {
      if (!validateSnapshot(snapshot, { logger: storageLogger })) return;
      const snapshotDate = marketDateFromIso(snapshot.dateTime, this.config);
      if (this.hasSnapshotForDay(snapshot.id, snapshotDate)) return;
      const copy = { ...snapshot };
      this.snapshots.push(copy);
      acceptedSnapshots.push(copy);
      accepted.push(snapshot.id);
      if (this.expectedSymbols.has(snapshot.id)) this.expectedSymbols.delete(snapshot.id);
    });

    if (acceptedSnapshots.length) {
      await this.storage?.addSnapshots?.(acceptedSnapshots).catch((error) =>
        this.logger.log({
          type: "warning",
          message: "Failed to persist snapshots",
          source: "navigator",
          context: { error: error?.message, count: acceptedSnapshots.length },
          now,
        })
      );

      this.logger.log({
        type: "info",
        message: "Accepted snapshots",
        source: "navigator",
        context: {
          acceptedCount: acceptedSnapshots.length,
          symbols: [...new Set(acceptedSnapshots.map((record) => record.id))],
          marketDate,
        },
        now,
      });
    }

    if (!this.expectedSymbols.size) {
      this.crawlComplete = true;
    }

    await this.runAnalysisIfDue(now, this.crawlComplete ? "crawl-complete" : "scheduled");

    return { accepted };
  }

  /**
   * Activates collection for a tab that matches the documented host list.
   *
   * @param {number} tabId - Chrome tab identifier.
   * @param {Date} [now=new Date()] - Clock used for deterministic testing.
   */
  startSession(tabId, now = new Date()) {
    if (this.activeTabId === tabId) return;
    this.activeTabId = tabId;
    this.logger.log({
      type: "info",
      message: "Activated collection session for market tab",
      source: "navigator",
      context: { tabId, schedule: { ...this.config } },
      now,
    });
    this.scheduleDailyTasks(now);
    this.refreshSymbolPlan(now);

    if (shouldPause(now, this.config)) {
      this.logger.log({
        type: "info",
        message: "Market blackout active; deferring collection until close",
        source: "navigator",
        context: { timestamp: now.toISOString() },
        now,
      });
      return;
    }

    if (shouldCollect(now, this.config)) {
      this.pruneRetention(now);
      this.startCrawl();
    } else {
      this.runAnalysisIfDue(now, "deadline");
    }
  }

  async startCrawl() {
    if (!this.symbolQueue.length || this.crawlTask || this.activeTabId === null) {
      this.logger.log({
        type: "debug",
        message: "Skipping crawl start",
        source: "navigator",
        context: {
          queuedSymbols: this.symbolQueue.length,
          hasActiveTask: Boolean(this.crawlTask),
          tabId: this.activeTabId,
        },
      });
      return;
    }
    if (!shouldCollect(new Date(), this.config)) {
      this.logger.log({
        type: "debug",
        message: "Crawl blocked outside collection window",
        source: "navigator",
      });
      return;
    }

    this.crawlController = new AbortController();
    const signal = this.crawlController.signal;

    this.crawlTask = crawlSymbols({
      tabId: this.activeTabId,
      symbols: this.symbolQueue,
      config: this.config,
      logger: this.logger,
      signal,
      onSnapshot: async (snapshot) => {
        await this.recordSnapshots([snapshot], new Date(snapshot.dateTime));
      },
    })
      .then(() => {
        this.logger.log({
          type: "info",
          message: "Completed symbol crawl",
          source: "navigator",
          context: { queuedSymbols: this.symbolQueue.length },
        });
      })
      .catch((error) => {
        if (signal.aborted) return;
        this.logger.log({
          type: "warning",
          message: "Symbol crawl interrupted",
          source: "navigator",
          context: { error: error?.message },
        });
      })
      .finally(async () => {
        this.crawlTask = null;
        await this.runAnalysisIfDue(new Date(), "crawl-complete");
      });
  }

  /**
   * Stops collection for the previously active tab and resets crawl flags so
   * a future visit restarts the full pipeline.
   *
   * @param {string} reason - Human-readable teardown cause.
   * @param {Date} [now=new Date()] - Clock used for deterministic testing.
   */
  stopSession(reason = "navigation-change", now = new Date()) {
    if (this.activeTabId === null) return;
    const tabId = this.activeTabId;
    this.activeTabId = null;
    this.expectedSymbols.clear();
    this.crawlComplete = false;
    this.symbolQueue = [];
    this.clearTimers();
    this.haltCrawl(reason, now);
    this.logger.log({
      type: "info",
      message: "Deactivated collection session",
      source: "navigator",
      context: { tabId, reason },
      now,
    });
  }

  async hydrateFromStorage(now = new Date()) {
    const persistedSnapshots = (await this.storage?.getSnapshots?.()) || [];
    if (persistedSnapshots.length) {
      this.snapshots = pruneSnapshots(persistedSnapshots, {
        now,
        retentionDays: this.config.RETENTION_DAYS,
        logger: storageLogger,
        config: this.config,
      });
      this.logger.log({
        type: "info",
        message: "Hydrated snapshots from storage",
        source: "navigator",
        context: { restoredCount: this.snapshots.length },
        now,
      });
    }

    const persistedCache = (await this.storage?.getAnalysisCache?.()) || [];
    persistedCache.forEach((row) => {
      if (row?.symbol && row?.lastAnalyzedAt) {
        this.analysisCache.set(row.symbol, row.lastAnalyzedAt);
      }
    });
    return { snapshots: this.snapshots.length, cache: this.analysisCache.size };
  }

  persistAnalysisOutputs() {
    if (!this.analysisResult) return;
    const { ranked, analyzedAt, analyzedSymbols } = this.analysisResult;
    const now = new Date();

    this.storage?.updateAnalysisCache?.(analyzedSymbols, analyzedAt).catch((error) =>
      this.logger.log({
        type: "warning",
        message: "Failed to persist analysis cache",
        source: "navigator",
        context: { error: error?.message },
      })
    );

    const scoredSnapshots = this.analysisResult.snapshots.filter(
      (snapshot) =>
        Number.isFinite(snapshot?.predictedSwingProbability) ||
        Number.isFinite(snapshot?.predictedSwingPercent)
    );
    if (scoredSnapshots.length) {
      this.storage?.upsertSnapshots?.(scoredSnapshots).catch((error) =>
        this.logger.log({
          type: "warning",
          message: "Failed to persist scored snapshots",
          source: "navigator",
          context: { error: error?.message, count: scoredSnapshots.length },
          now,
        })
      );
      this.logger.log({
        type: "info",
        message: "Persisted scored snapshots",
        source: "navigator",
        context: { count: scoredSnapshots.length },
        now,
      });
    }

    if (chromeApi?.storage?.local?.set) {
      chromeApi.storage.local.set({ rankedResults: ranked }, () => {
        if (chromeApi.runtime?.lastError) {
          this.logger.log({
            type: "warning",
            message: "Failed to cache ranked results",
            source: "navigator",
            context: { error: chromeApi.runtime.lastError?.message },
          });
        }
      });
    }
  }
}

export const navigatorService = new NavigatorService();

initializeRuntimeSettings({
  logger: navigatorService.logger,
  onUpdate: (config) => navigatorService.updateConfig(config),
});

function isMarketHost(url) {
  return typeof url === "string" && MARKET_HOST_PATTERN.test(url);
}

function attachTabListeners() {
  if (!chromeApi?.tabs || attachTabListeners.initialized) return;

  const handleTabActivation = async (activeInfo) => {
    try {
      const tab = await chromeApi.tabs.get(activeInfo.tabId);
      if (isMarketHost(tab?.url)) {
        navigatorService.startSession(activeInfo.tabId);
      } else {
        navigatorService.stopSession("tab-inactive");
      }
    } catch (error) {
      navigatorService.logger.log({
        type: "error",
        message: "Failed to evaluate active tab for collection",
        source: "navigator",
        context: { error: error?.message, tabId: activeInfo?.tabId },
      });
    }
  };

  const handleTabUpdate = (tabId, changeInfo) => {
    if (!changeInfo.url) return;
    if (isMarketHost(changeInfo.url)) {
      navigatorService.startSession(tabId);
      navigatorService.refreshSymbolPlan();
    } else {
      navigatorService.stopSession("navigated-away");
    }
  };

  const handleTabRemoved = (tabId) => {
    if (tabId !== navigatorService.activeTabId) return;
    navigatorService.stopSession("tab-closed");
  };

  const hydrateActiveTab = async () => {
    try {
      const [tab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
      if (isMarketHost(tab?.url)) {
        navigatorService.startSession(tab.id);
      } else {
        navigatorService.stopSession("tab-inactive");
      }
    } catch (error) {
      navigatorService.logger.log({
        type: "warning",
        message: "Failed to hydrate active tab",
        source: "navigator",
        context: { error: error?.message },
      });
    }
  };

  chromeApi.tabs.onActivated.addListener(handleTabActivation);
  chromeApi.tabs.onUpdated.addListener(handleTabUpdate);
  chromeApi.tabs.onRemoved.addListener(handleTabRemoved);
  attachTabListeners.initialized = true;

  // Ensure we attach to the current active tab when the service worker wakes.
  hydrateActiveTab();
}

attachTabListeners();
