import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";
import { shouldCollect, shouldPause, shouldRunAnalysis } from "./scheduling.js";
import { marketDateFromIso } from "./time.js";
import { pruneLogs, pruneSnapshots, buildLogEntry } from "../storage/retention.js";
import { validateSnapshot } from "../storage/schema.js";
import { runSwingAnalysis } from "../analysis/index.js";

export class NavigatorService {
  constructor({ config = DEFAULT_RUNTIME_CONFIG } = {}) {
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.snapshots = [];
    this.logs = [];
    this.expectedSymbols = new Set();
    this.crawlComplete = false;
    this.analysisResult = null;
    this.lastPruneDate = null;
  }

  planSymbols(symbols = []) {
    this.expectedSymbols = new Set(symbols.filter(Boolean).map((s) => String(s)));
    this.crawlComplete = this.expectedSymbols.size === 0;
  }

  hasSnapshotForDay(symbol, marketDate) {
    return this.snapshots.some(
      (entry) => entry.id === symbol && marketDateFromIso(entry.dateTime) === marketDate
    );
  }

  recordSnapshots(records = [], now = new Date()) {
    if (shouldPause(now, this.config)) {
      this.logs.push(
        buildLogEntry(
          {
            type: "info",
            message: "Skip collection during blackout window",
            ttlDays: this.config.LOG_RETENTION_DAYS.info,
          },
          now
        )
      );
      return { accepted: [] };
    }

    if (!shouldCollect(now, this.config)) {
      return { accepted: [] };
    }

    const marketDate = marketDateFromIso(now.toISOString());

    if (this.lastPruneDate !== marketDate) {
      this.snapshots = pruneSnapshots(this.snapshots, {
        now,
        retentionDays: this.config.RETENTION_DAYS,
      });
      this.logs = pruneLogs(this.logs, { now });
      this.lastPruneDate = marketDate;
    }

    const accepted = [];
    records.forEach((snapshot) => {
      if (!validateSnapshot(snapshot)) return;
      const snapshotDate = marketDateFromIso(snapshot.dateTime);
      if (this.hasSnapshotForDay(snapshot.id, snapshotDate)) return;
      this.snapshots.push({ ...snapshot });
      accepted.push(snapshot.id);
      if (this.expectedSymbols.has(snapshot.id)) this.expectedSymbols.delete(snapshot.id);
    });

    if (!this.expectedSymbols.size) {
      this.crawlComplete = true;
    }

    if (shouldRunAnalysis({ now, crawlComplete: this.crawlComplete, config: this.config })) {
      this.analysisResult = runSwingAnalysis(this.snapshots, now);
    }

    return { accepted };
  }
}

export const navigatorService = new NavigatorService();
