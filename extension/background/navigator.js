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
const MARKET_HOST_PATTERN = /^https?:\/\/tsetmc\.com\//i;

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
    // Route storage adapter telemetry into the structured log stream.
    this.storage?.setLogger?.(storageLogger);
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

  /**
   * Clears any active market-close or analysis-deadline timers.
   */
  clearTimers() {
    const hadCloseTimer = Boolean(this.closeTimer);
    const hadDeadlineTimer = Boolean(this.deadlineTimer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.closeTimer = null;
    this.deadlineTimer = null;
    this.logger.log({
      type: "debug",
      message: "Cleared market timers",
      source: "navigator",
      context: { hadCloseTimer, hadDeadlineTimer },
      now: new Date(),
    });
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG, now = new Date()) {
    const previous = this.config;
    this.config = getRuntimeConfig(config);
    this.logger.updateConfig?.(this.config);
    this.storage?.updateConfig?.(this.config);
    this.logger.log({
      type: "debug",
      message: "Updating runtime config",
      source: "navigator",
      context: {
        previousDb: previous?.DB_NAME,
        nextDb: this.config.DB_NAME,
        previousSchedule: previous
          ? {
              MARKET_OPEN: previous.MARKET_OPEN,
              MARKET_CLOSE: previous.MARKET_CLOSE,
              ANALYSIS_DEADLINE: previous.ANALYSIS_DEADLINE,
            }
          : null,
      },
      now,
    });
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
      this.logger.log({
        type: "debug",
        message: "Scheduling market close timer",
        source: "navigator",
        context: { closeDelay },
        now,
      });
      this.closeTimer = setTimeout(() => this.handleMarketClose(), closeDelay);
    }
    if (deadlineDelay !== null) {
      this.logger.log({
        type: "debug",
        message: "Scheduling analysis deadline timer",
        source: "navigator",
        context: { deadlineDelay },
        now,
      });
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
    if (!wasActive) {
      this.logger.log({
        type: "debug",
        message: "Halt crawl skipped; no active crawl",
        source: "navigator",
        context: { reason },
        now,
      });
      return;
    }
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
      type: "debug",
      message: "Handling analysis deadline trigger",
      source: "navigator",
      context: { timestamp: now.toISOString() },
      now,
    });
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
    this.logger.log({
      type: "debug",
      message: "Normalizing planned symbols",
      source: "navigator",
      context: { requested: symbols.length, normalized: normalized.length },
      now,
    });
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
      type: "debug",
      message: "Prepared crawl queue",
      source: "navigator",
      context: {
        queueSize: this.symbolQueue.length,
        expectedCount: this.expectedSymbols.size,
        marketDate,
      },
      now,
    });
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
    if (this.symbolRefresh || this.activeTabId === null) {
      this.logger.log({
        type: "debug",
        message: "Skipping symbol refresh",
        source: "navigator",
        context: {
          alreadyRefreshing: Boolean(this.symbolRefresh),
          tabId: this.activeTabId,
        },
        now,
      });
      return;
    }
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
        this.logger.log({
          type: "debug",
          message: "Symbol refresh completed",
          source: "navigator",
          context: { tabId: this.activeTabId },
          now,
        });
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
    if (this.lastPruneDate === marketDate) {
      this.logger.log({
        type: "debug",
        message: "Retention already pruned for market date",
        source: "navigator",
        context: { marketDate },
        now,
      });
      return marketDate;
    }

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
      type: "debug",
      message: "Retention sweep completed",
      source: "navigator",
      context: {
        snapshotsBefore: snapshotCountBefore,
        snapshotsAfter: this.snapshots.length,
        logsBefore: logCountBefore,
        logsAfter: this.logs.length,
      },
      now,
    });
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

  /**
   * Persists analysis status updates to chrome storage for UI visibility.
   *
   * @param {object} status - Analysis progress metadata.
   * @param {Date} [now=new Date()] - Timestamp for status freshness.
   */
  updateAnalysisStatus(status, now = new Date()) {
    if (!chromeApi?.storage?.local?.set) return;
    this.logger.log({
      type: "debug",
      message: "Updating analysis status",
      source: "navigator",
      context: { state: status?.state, progress: status?.progress, reason: status?.reason },
      now,
    });
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

    const shouldRun = shouldRunAnalysis({
      now,
      crawlComplete: this.crawlComplete,
      config: this.config,
    });
    if (!shouldRun) {
      this.logger.log({
        type: "debug",
        message: "Analysis not due",
        source: "navigator",
        context: { reason, crawlComplete: this.crawlComplete },
        now,
      });
      return;
    }

    this.logger.log({
      type: "debug",
      message: "Starting analysis workflow",
      source: "navigator",
      context: { reason, snapshotCount: this.snapshots.length },
      now,
    });
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

      this.logger.log({
        type: "debug",
        message: "Analysis completed; processing outputs",
        source: "navigator",
        context: {
          rankedCount: this.analysisResult?.ranked?.length ?? 0,
          analyzedSymbols: this.analysisResult?.analyzedSymbols?.length ?? 0,
        },
        now,
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
      this.logger.log({
        type: "debug",
        message: "Analysis workflow finished",
        source: "navigator",
        context: { reason },
        now: new Date(),
      });
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
    this.logger.log({
      type: "debug",
      message: "Recording snapshots",
      source: "navigator",
      context: { incomingCount: records.length },
      now,
    });
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
    let invalidCount = 0;
    let duplicateCount = 0;

    records.forEach((snapshot) => {
      if (!validateSnapshot(snapshot, { logger: storageLogger })) {
        invalidCount += 1;
        return;
      }
      const snapshotDate = marketDateFromIso(snapshot.dateTime, this.config);
      if (this.hasSnapshotForDay(snapshot.id, snapshotDate)) {
        duplicateCount += 1;
        return;
      }
      const copy = { ...snapshot };
      this.snapshots.push(copy);
      acceptedSnapshots.push(copy);
      accepted.push(snapshot.id);
      if (this.expectedSymbols.has(snapshot.id)) this.expectedSymbols.delete(snapshot.id);
    });

    this.logger.log({
      type: "debug",
      message: "Snapshot intake summary",
      source: "navigator",
      context: {
        acceptedCount: acceptedSnapshots.length,
        invalidCount,
        duplicateCount,
        remainingExpected: this.expectedSymbols.size,
      },
      now,
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
    if (this.activeTabId === tabId) {
      this.logger.log({
        type: "debug",
        message: "Session already active for tab",
        source: "navigator",
        context: { tabId },
        now,
      });
      return;
    }
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
    const now = new Date();
    if (!shouldCollect(now, this.config)) {
      this.logger.log({
        type: "debug",
        message: "Crawl blocked outside collection window",
        source: "navigator",
        context: { timestamp: now.toISOString() },
        now,
      });
      return;
    }

    // Create a fresh controller so this crawl can be cancelled independently.
    this.crawlController = new AbortController();
    const signal = this.crawlController.signal;

    this.logger.log({
      type: "debug",
      message: "Created crawl controller",
      source: "navigator",
      context: { tabId: this.activeTabId, queuedSymbols: this.symbolQueue.length },
      now,
    });
    this.logger.log({
      type: "info",
      message: "Starting symbol crawl",
      source: "navigator",
      context: {
        queuedSymbols: this.symbolQueue.length,
        tabId: this.activeTabId,
      },
      now,
    });

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
        this.logger.log({
          type: "debug",
          message: "Crawl task finalized",
          source: "navigator",
          context: { tabId: this.activeTabId, remainingQueue: this.symbolQueue.length },
        });
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
    if (this.activeTabId === null) {
      this.logger.log({
        type: "debug",
        message: "Stop session skipped; no active tab",
        source: "navigator",
        context: { reason },
        now,
      });
      return;
    }
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
    this.logger.log({
      type: "debug",
      message: "Hydrating snapshots from storage",
      source: "navigator",
      context: { persistedCount: persistedSnapshots.length },
      now,
    });
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
    this.logger.log({
      type: "debug",
      message: "Hydrating analysis cache from storage",
      source: "navigator",
      context: { persistedCount: persistedCache.length },
      now,
    });
    persistedCache.forEach((row) => {
      if (row?.symbol && row?.lastAnalyzedAt) {
        this.analysisCache.set(row.symbol, row.lastAnalyzedAt);
      }
    });
    if (persistedCache.length) {
      this.logger.log({
        type: "info",
        message: "Hydrated analysis cache from storage",
        source: "navigator",
        context: { restoredCount: this.analysisCache.size },
        now,
      });
    }
    return { snapshots: this.snapshots.length, cache: this.analysisCache.size };
  }

  persistAnalysisOutputs() {
    if (!this.analysisResult) {
      this.logger.log({
        type: "debug",
        message: "No analysis result to persist",
        source: "navigator",
        context: {},
        now: new Date(),
      });
      return;
    }
    const { ranked, analyzedAt, analyzedSymbols } = this.analysisResult;
    const now = new Date();

    this.logger.log({
      type: "debug",
      message: "Persisting analysis outputs",
      source: "navigator",
      context: {
        rankedCount: ranked?.length ?? 0,
        analyzedSymbols: analyzedSymbols?.length ?? 0,
        analyzedAt,
      },
      now,
    });
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

/**
 * Determine whether a URL matches the supported market host list.
 *
 * @param {string} url - Candidate URL to evaluate.
 * @returns {boolean} True when the URL matches a supported host.
 */
function isMarketHost(url) {
  return typeof url === "string" && MARKET_HOST_PATTERN.test(url);
}

/**
 * Attach chrome tab listeners to manage the background crawl lifecycle.
 */
function attachTabListeners() {
  if (!chromeApi?.tabs || attachTabListeners.initialized) return;
  navigatorService.logger.log({
    type: "info",
    message: "Attaching tab listeners",
    source: "navigator",
    context: { hasTabsApi: Boolean(chromeApi?.tabs) },
  });

  const handleTabActivation = async (activeInfo) => {
    navigatorService.logger.log({
      type: "debug",
      message: "Tab activated",
      source: "navigator",
      context: { tabId: activeInfo?.tabId },
    });
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
    navigatorService.logger.log({
      type: "debug",
      message: "Tab URL updated",
      source: "navigator",
      context: { tabId, url: changeInfo.url },
    });
    if (isMarketHost(changeInfo.url)) {
      navigatorService.startSession(tabId);
      navigatorService.refreshSymbolPlan();
    } else {
      navigatorService.stopSession("navigated-away");
    }
  };

  const handleTabRemoved = (tabId) => {
    navigatorService.logger.log({
      type: "debug",
      message: "Tab removed",
      source: "navigator",
      context: { tabId },
    });
    if (tabId !== navigatorService.activeTabId) return;
    navigatorService.stopSession("tab-closed");
  };

  const hydrateActiveTab = async () => {
    navigatorService.logger.log({
      type: "debug",
      message: "Hydrating active tab on startup",
      source: "navigator",
      context: {},
    });
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
