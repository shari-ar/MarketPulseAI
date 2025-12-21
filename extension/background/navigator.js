import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../runtime-config.js";
import { shouldCollect, shouldPause, shouldRunAnalysis } from "./scheduling.js";
import { marketDateFromIso } from "./time.js";
import { pruneSnapshots } from "../storage/retention.js";
import { validateSnapshot } from "../storage/schema.js";
import { storageLogger } from "../storage/logger.js";
import { runSwingAnalysis } from "../analysis/index.js";
import { LoggingService, loggingService as sharedLogger } from "./logger.js";

/**
 * Central stateful controller for orchestrating snapshot collection, log retention,
 * and triggering swing analysis once the crawl is complete or deadlines are reached.
 */
export class NavigatorService {
  constructor({ config = DEFAULT_RUNTIME_CONFIG, logger = sharedLogger } = {}) {
    this.config = getRuntimeConfig(config);
    this.logger = logger instanceof LoggingService ? logger : new LoggingService({ config });
    this.snapshots = [];
    this.expectedSymbols = new Set();
    this.crawlComplete = false;
    this.analysisResult = null;
    this.lastPruneDate = null;
  }

  get logs() {
    return this.logger.getLogs();
  }

  /**
   * Seeds the expected symbol set to track completion status across a crawl cycle.
   *
   * @param {string[]} symbols - Symbols anticipated from the collector.
   */
  planSymbols(symbols = []) {
    this.expectedSymbols = new Set(symbols.filter(Boolean).map((s) => String(s)));
    this.crawlComplete = this.expectedSymbols.size === 0;
    this.logger.log({
      type: "info",
      message: "Planned symbol crawl",
      context: { expectedCount: this.expectedSymbols.size },
      source: "navigator",
    });
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
      (entry) => entry.id === symbol && marketDateFromIso(entry.dateTime) === marketDate
    );
  }

  /**
   * Validates and stores incoming snapshots while enforcing blackout windows,
   * pruning retention windows, and kicking off analysis when criteria are met.
   *
   * @param {import("../storage/schema.js").Snapshot[]} records - Candidate snapshots.
   * @param {Date} now - Timestamp used for schedule checks.
   * @returns {{accepted: string[]}} Set of symbol ids accepted into storage.
   */
  recordSnapshots(records = [], now = new Date()) {
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
      return { accepted: [] };
    }

    const marketDate = marketDateFromIso(now.toISOString());

    if (this.lastPruneDate !== marketDate) {
      const snapshotCountBefore = this.snapshots.length;
      const logCountBefore = this.logs.length;
      this.snapshots = pruneSnapshots(this.snapshots, {
        now,
        retentionDays: this.config.RETENTION_DAYS,
        logger: storageLogger,
      });
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
    }

    const accepted = [];
    records.forEach((snapshot) => {
      if (!validateSnapshot(snapshot, { logger: storageLogger })) return;
      const snapshotDate = marketDateFromIso(snapshot.dateTime);
      if (this.hasSnapshotForDay(snapshot.id, snapshotDate)) return;
      this.snapshots.push({ ...snapshot });
      accepted.push(snapshot.id);
      if (this.expectedSymbols.has(snapshot.id)) this.expectedSymbols.delete(snapshot.id);
    });

    if (accepted.length) {
      this.logger.log({
        type: "info",
        message: "Accepted snapshots",
        source: "navigator",
        context: {
          acceptedCount: accepted.length,
          symbols: [...new Set(accepted)],
        },
        now,
      });
    }

    if (!this.expectedSymbols.size) {
      this.crawlComplete = true;
    }

    if (shouldRunAnalysis({ now, crawlComplete: this.crawlComplete, config: this.config })) {
      this.analysisResult = runSwingAnalysis(this.snapshots, now);
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
    }

    return { accepted };
  }
}

export const navigatorService = new NavigatorService();
