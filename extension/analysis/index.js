import { rankSwingResults } from "./rank.js";
import { logAnalysisEvent } from "./logger.js";
import { loadModelManifest, resolveScoringStrategy } from "./model-runtime.js";

/**
 * Runs the end-to-end swing analysis pipeline from raw snapshot ingestion to
 * a ranked output list. Keeping these steps co-located clarifies the
 * dependency order: window building -> scoring -> ranking.
 */

/**
 * Groups incoming snapshots by their identifier and builds fixed-size, most-recent-first windows.
 * Only symbol windows with at least seven snapshots are retained so downstream analysis
 * works with a consistent lookback period.
 *
 * @param {Array<{id: string, dateTime: string}>} snapshots - Raw snapshots collected over time.
 * @returns {Array<Array<object>>} Collection of snapshot windows ordered by recency.
 */
function buildWindows(snapshots = []) {
  const grouped = snapshots.reduce((acc, snapshot) => {
    const key = snapshot.id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(snapshot);
    return acc;
  }, {});

  return Object.values(grouped)
    .map((entries) => entries.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)))
    .filter((entries) => entries.length >= 7)
    .map((entries) => entries.slice(0, 7));
}

function isValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Ensures a window has the minimal numerical features needed for scoring.
 *
 * @param {Array<object>} window - Ordered window of snapshots.
 * @returns {boolean} True when the window can be scored.
 */
function isWindowScorable(window = []) {
  if (!window.length) return false;
  return window.every((snapshot) =>
    [snapshot?.high, snapshot?.close, snapshot?.primeCost].some(isValidNumber)
  );
}

/**
 * Applies calculated swing metrics back onto the latest snapshot in each window
 * so exports and downstream consumers stay aligned with model outputs.
 *
 * @param {Array<object>} snapshots - Full snapshot collection.
 * @param {Array<object>} scores - Calculated scores keyed by id + dateTime.
 * @returns {Array<object>} Snapshots decorated with swing predictions.
 */
function applyScoresToSnapshots(snapshots = [], scores = []) {
  const keyIndex = new Map();
  const hydrated = snapshots.map((snapshot, index) => {
    keyIndex.set(`${snapshot.id}-${snapshot.dateTime}`, index);
    return { ...snapshot };
  });

  scores.forEach((score) => {
    const index = keyIndex.get(`${score.id}-${score.dateTime}`);
    if (index === undefined) return;
    hydrated[index].predictedSwingPercent = score.predictedSwingPercent;
    hydrated[index].predictedSwingProbability = score.predictedSwingProbability;
  });

  return hydrated;
}

function selectRankableSnapshots(scored = [], snapshots = []) {
  const scoredKeys = new Set(scored.map((entry) => `${entry.id}-${entry.dateTime}`));
  return snapshots.filter((snapshot) => scoredKeys.has(`${snapshot.id}-${snapshot.dateTime}`));
}

function filterFreshWindows(windows, analysisCache = new Map()) {
  if (!analysisCache?.size) return windows;

  return windows.filter((window) => {
    const latest = window[0];
    const lastAnalyzed = analysisCache.get(latest?.id);
    if (!lastAnalyzed) return true;
    return new Date(latest.dateTime) > new Date(lastAnalyzed);
  });
}

/**
 * Scores and ranks swing opportunities across all available symbols, preserving the
 * analyzed timestamp for traceability and reporting.
 *
 * @param {Array<object>} snapshots - Recent snapshots spanning multiple symbols.
 * @param {object} [options]
 * @param {Date} [options.now=new Date()] - Evaluation timestamp for the analysis output.
 * @param {Map<string,string>} [options.analysisCache=new Map()] - Symbol freshness cache.
 * @param {function} [options.onProgress] - Optional progress callback.
 * @returns {Promise<{ranked: Array<object>, analyzedAt: string, snapshots: Array<object>, analyzedSymbols: Array<string>}>}
 */
export async function runSwingAnalysis(
  snapshots = [],
  { now = new Date(), analysisCache = new Map(), onProgress } = {}
) {
  const snapshotCount = snapshots.length;
  const symbolCount = new Set(snapshots.map((snapshot) => snapshot.id)).size;
  const analysisStart = Date.now();

  logAnalysisEvent({
    type: "debug",
    message: "Preparing swing analysis inputs",
    context: { snapshotCount, symbolCount, cacheSize: analysisCache.size },
    now,
  });
  logAnalysisEvent({
    message: "Started swing analysis",
    context: { snapshotCount, symbolCount },
    now,
  });

  const windows = buildWindows(snapshots);
  logAnalysisEvent({
    type: "debug",
    message: "Windowed snapshots for analysis",
    context: { windowCount: windows.length },
    now,
  });
  logAnalysisEvent({
    type: "debug",
    message: "Captured window build metrics",
    context: {
      totalSnapshots: snapshotCount,
      windowsPerSymbolAvg: windows.length ? windows.length / symbolCount : 0,
    },
    now,
  });
  const freshWindows = filterFreshWindows(windows, analysisCache);
  logAnalysisEvent({
    type: "debug",
    message: "Filtered windows against analysis cache",
    context: { freshWindowCount: freshWindows.length, cacheSize: analysisCache.size },
    now,
  });
  const analyzedSymbols = freshWindows.map((window) => window[0]?.id).filter(Boolean);
  logAnalysisEvent({
    type: "debug",
    message: "Prepared analyzed symbol list",
    context: { analyzedCount: analyzedSymbols.length },
    now,
  });

  logAnalysisEvent({
    message: "Built analysis windows",
    context: {
      windowCount: windows.length,
      analyzedSymbols,
      filteredSymbols: symbolCount - analyzedSymbols.length,
    },
    now,
  });

  if (!freshWindows.length) {
    logAnalysisEvent({
      type: "warning",
      message: "Insufficient snapshots for swing analysis",
      context: { snapshotCount, symbolCount },
      now,
    });
    return { ranked: [], analyzedAt: now.toISOString(), snapshots, analyzedSymbols: [] };
  }

  logAnalysisEvent({
    type: "debug",
    message: "Loading model assets for analysis",
    context: { windowCount: freshWindows.length },
    now,
  });
  const manifest = await loadModelManifest({ logger: logAnalysisEvent, now });
  const scoreWindow = await resolveScoringStrategy({ manifest, logger: logAnalysisEvent, now });
  if (!scoreWindow) {
    logAnalysisEvent({
      type: "warning",
      message: "Analysis skipped due to missing model assets",
      context: { snapshotCount, symbolCount },
      now,
    });
    return { ranked: [], analyzedAt: now.toISOString(), snapshots, analyzedSymbols: [] };
  }
  logAnalysisEvent({
    type: "debug",
    message: "Model assets resolved for scoring",
    context: { manifestId: manifest?.id ?? null },
    now,
  });

  const scoringStartedAt = Date.now();
  const scored = [];
  for (let index = 0; index < freshWindows.length; index += 1) {
    const window = freshWindows[index];
    logAnalysisEvent({
      type: "debug",
      message: "Scoring analysis window",
      context: { index: index + 1, total: freshWindows.length, symbol: window[0]?.id },
      now,
    });
    if (!isWindowScorable(window)) {
      logAnalysisEvent({
        type: "warning",
        message: "Skipped window with invalid inputs",
        context: { symbol: window[0]?.id, dateTime: window[0]?.dateTime },
        now,
      });
      continue;
    }

    const scoredEntry = scoreWindow(window, { now });
    logAnalysisEvent({
      type: "debug",
      message: "Score window returned entry",
      context: { symbol: window[0]?.id, hasScore: Boolean(scoredEntry) },
      now,
    });
    if (!scoredEntry) continue;
    scored.push({ ...scoredEntry, window });

    if (onProgress) {
      const progress = (index + 1) / freshWindows.length;
      onProgress(progress);
      logAnalysisEvent({
        type: "debug",
        message: "Updated analysis progress",
        context: { progress },
        now,
      });
    }
  }

  logAnalysisEvent({
    message: "Scored swing windows",
    context: { scoredCount: scored.length, durationMs: Date.now() - scoringStartedAt },
    now,
  });

  const scoredSymbols = scored.map((entry) => entry.id).filter(Boolean);
  const decoratedSnapshots = applyScoresToSnapshots(snapshots, scored);
  const rankableSnapshots = selectRankableSnapshots(scored, decoratedSnapshots);
  logAnalysisEvent({
    type: "debug",
    message: "Applied scores to snapshots",
    context: { scoredSymbols: scoredSymbols.length, decoratedCount: decoratedSnapshots.length },
    now,
  });
  logAnalysisEvent({
    type: "debug",
    message: "Prepared snapshots for ranking",
    context: {
      scoredSymbols: scoredSymbols.length,
      rankableCount: rankableSnapshots.length,
      decoratedCount: decoratedSnapshots.length,
    },
    now,
  });
  const ranked = rankSwingResults(rankableSnapshots, undefined, { logger: logAnalysisEvent, now });

  logAnalysisEvent({
    message: "Ranked swing opportunities",
    context: { rankedCount: ranked.length },
    now,
  });
  logAnalysisEvent({
    type: "debug",
    message: "Completed swing analysis pipeline",
    context: { durationMs: Date.now() - analysisStart },
    now,
  });

  return {
    ranked,
    analyzedAt: now.toISOString(),
    snapshots: decoratedSnapshots,
    analyzedSymbols: scoredSymbols,
  };
}

const DedicatedWorkerScope =
  typeof globalThis !== "undefined" ? globalThis.DedicatedWorkerGlobalScope : undefined;
const isDedicatedWorker =
  typeof DedicatedWorkerScope !== "undefined" &&
  typeof self !== "undefined" &&
  self instanceof DedicatedWorkerScope;

if (isDedicatedWorker) {
  // Dedicated worker listener mirrors the background analysis API contract.
  self.onmessage = async (event) => {
    const { type, payload } = event.data || {};
    if (type !== "analyze") return;

    try {
      logAnalysisEvent({
        message: "Worker received analysis request",
        context: { snapshotCount: payload?.snapshots?.length ?? 0 },
        now: payload?.now ? new Date(payload.now) : new Date(),
      });
      const result = await runSwingAnalysis(payload.snapshots, {
        now: payload.now ? new Date(payload.now) : new Date(),
        analysisCache: new Map(payload.analysisCache || []),
        onProgress: (progress) => {
          self.postMessage({ type: "progress", payload: { progress } });
        },
      });
      logAnalysisEvent({
        message: "Worker completed analysis request",
        context: { rankedCount: result?.ranked?.length ?? 0 },
        now: result?.analyzedAt ? new Date(result.analyzedAt) : new Date(),
      });
      self.postMessage({ type: "complete", payload: result });
    } catch (error) {
      logAnalysisEvent({
        type: "error",
        message: "Worker analysis failed",
        context: { error: error?.message },
        now: new Date(),
      });
      self.postMessage({
        type: "error",
        payload: { message: error?.message || "Unknown analysis error" },
      });
    }
  };
}
