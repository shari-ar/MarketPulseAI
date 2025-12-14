import db from "../storage/db.js";
import { SNAPSHOT_TABLE, ANALYSIS_CACHE_TABLE } from "../storage/schema.js";
import { pickLatestBySymbol } from "../popup-helpers.js";
import { isAnalysisFreshForSymbol } from "../storage/analysis-cache.js";
import { setLastAnalysisStatus } from "../storage/analysis-status.js";
import { runAnalysisInWorker } from "./worker-client.js";

function snapshotToPriceEntry(snapshot) {
  if (!snapshot?.id) return null;

  const open = snapshot.open ?? snapshot.primeCost ?? snapshot.close;
  const high = snapshot.high ?? snapshot.allowedHigh ?? snapshot.primeCost;
  const low = snapshot.low ?? snapshot.allowedLow ?? snapshot.primeCost;
  const close = snapshot.primeCost ?? snapshot.close ?? snapshot.open;

  if (
    [open, high, low, close].some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    return null;
  }

  return {
    symbol: snapshot.id,
    open,
    high,
    low,
    close,
    capturedAt: snapshot.dateTime,
  };
}

export class ImmediateAnalyzer {
  constructor({
    dbInstance = db,
    snapshotTableName = SNAPSHOT_TABLE,
    analysisCacheTableName = ANALYSIS_CACHE_TABLE,
    analysisRunner = runAnalysisInWorker,
  } = {}) {
    this.db = dbInstance;
    this.snapshotTableName = snapshotTableName;
    this.analysisCacheTableName = analysisCacheTableName;
    this.analysisRunner = analysisRunner;
    this._running = null;
    this._pending = false;
  }

  setAnalysisRunner(runner) {
    this.analysisRunner = typeof runner === "function" ? runner : runAnalysisInWorker;
  }

  async collectPendingPriceArrays() {
    await this.db.open();
    const snapshotTable = this.db.table(this.snapshotTableName);
    const cacheTable = this.db.table(this.analysisCacheTableName);
    const snapshots = await snapshotTable.toArray();
    const latestPerSymbol = pickLatestBySymbol(snapshots);

    const pending = [];
    for (const snapshot of latestPerSymbol) {
      const entry = snapshotToPriceEntry(snapshot);
      if (!entry) continue;

      const fresh = await isAnalysisFreshForSymbol(entry.symbol, {
        latestDataTimestamp: entry.capturedAt,
        table: cacheTable,
      });

      if (!fresh) {
        pending.push(entry);
      }
    }

    return pending;
  }

  async runOnce() {
    try {
      const priceArrays = await this.collectPendingPriceArrays();
      if (!priceArrays.length) {
        await setLastAnalysisStatus({
          state: "skipped",
          message: "Analysis was skipped because no pending symbols needed processing.",
          analyzedCount: 0,
        });
        return null;
      }

      return await this.analysisRunner(priceArrays);
    } catch (error) {
      await setLastAnalysisStatus({
        state: "error",
        message: error?.message || "Immediate analysis failed.",
        details: error?.stack || String(error),
        analyzedCount: 0,
      });
      return null;
    }
  }

  async trigger() {
    this._pending = true;
    if (this._running) {
      return this._running;
    }

    this._running = this._drain();
    return this._running;
  }

  async _drain() {
    try {
      while (this._pending) {
        this._pending = false;
        await this.runOnce();
      }
    } finally {
      this._running = null;
    }
  }
}

const immediateAnalyzer = new ImmediateAnalyzer();

export function triggerImmediateAnalysis() {
  return immediateAnalyzer.trigger();
}

export function setImmediateAnalysisRunner(runner) {
  return immediateAnalyzer.setAnalysisRunner(runner);
}
