import db from "../storage/db.js";
import { analyzeHeadlessly } from "./index.js";
import { SNAPSHOT_TABLE, ANALYSIS_CACHE_TABLE } from "../storage/schema.js";
import { pickLatestBySymbol } from "../popup-helpers.js";
import { isAnalysisFreshForSymbol } from "../storage/analysis-cache.js";

function snapshotToPriceEntry(snapshot) {
  if (!snapshot?.id) return null;

  const open = snapshot.firstPrice ?? snapshot.closingPrice ?? snapshot.lastTrade;
  const high = snapshot.dailyHighRange ?? snapshot.allowedHighPrice ?? snapshot.closingPrice;
  const low = snapshot.dailyLowRange ?? snapshot.allowedLowPrice ?? snapshot.closingPrice;
  const close = snapshot.closingPrice ?? snapshot.lastTrade ?? snapshot.firstPrice;

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
    analysisRunner = analyzeHeadlessly,
  } = {}) {
    this.db = dbInstance;
    this.snapshotTableName = snapshotTableName;
    this.analysisCacheTableName = analysisCacheTableName;
    this.analysisRunner = analysisRunner;
    this._running = null;
    this._pending = false;
  }

  setAnalysisRunner(runner) {
    this.analysisRunner = typeof runner === "function" ? runner : analyzeHeadlessly;
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
      if (!priceArrays.length) return null;

      return await this.analysisRunner(priceArrays);
    } catch (error) {
      console.error("Immediate analysis failed", error);
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
