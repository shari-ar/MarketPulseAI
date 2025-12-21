import { rankSwingResults } from "./rank.js";
import { marketDateFromIso } from "../background/time.js";
import { logAnalysisEvent } from "./logger.js";

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

/**
 * Derives swing metrics for a single fixed window, normalizing the calculation to the
 * oldest point in the window and constraining extremes to avoid skewed probabilities.
 *
 * @param {Array<object>} window - Ordered window of snapshots for a specific symbol.
 * @returns {{predictedSwingPercent: number, predictedSwingProbability: number, dateTime: string, id: string, marketDate: string}}
 *   Structured swing metrics tied to the most recent snapshot.
 */
function scoreWindow(window = []) {
  const latest = window[0];
  const oldest = window[window.length - 1];
  const reference = oldest?.primeCost || oldest?.close || 1;
  const swingPercent = (((latest.high ?? latest.close ?? reference) - reference) / reference) * 100;
  const boundedPercent = Math.max(-50, Math.min(50, swingPercent));
  const swingProbability = Math.max(0.01, Math.min(0.99, Math.abs(boundedPercent) / 100));

  return {
    predictedSwingPercent: Number(boundedPercent.toFixed(2)),
    predictedSwingProbability: Number(swingProbability.toFixed(2)),
    dateTime: latest.dateTime,
    id: latest.id,
    marketDate: marketDateFromIso(latest.dateTime),
  };
}

/**
 * Scores and ranks swing opportunities across all available symbols, preserving the
 * analyzed timestamp for traceability and reporting.
 *
 * @param {Array<object>} snapshots - Recent snapshots spanning multiple symbols.
 * @param {Date} [now=new Date()] - Evaluation timestamp for the analysis output.
 * @returns {{ranked: Array<object>, analyzedAt: string}} Ranked swing results with metadata.
 */
export function runSwingAnalysis(snapshots = [], now = new Date()) {
  const snapshotCount = snapshots.length;
  const symbolCount = new Set(snapshots.map((snapshot) => snapshot.id)).size;

  logAnalysisEvent({
    message: "Started swing analysis",
    context: { snapshotCount, symbolCount },
    now,
  });

  const windows = buildWindows(snapshots);
  const analyzedSymbols = windows.map((window) => window[0]?.id).filter(Boolean);
  const filteredSymbols = symbolCount - analyzedSymbols.length;

  logAnalysisEvent({
    message: "Built analysis windows",
    context: {
      windowCount: windows.length,
      analyzedSymbols,
      filteredSymbols,
    },
    now,
  });

  if (!windows.length) {
    logAnalysisEvent({
      type: "warning",
      message: "Insufficient snapshots for swing analysis",
      context: { snapshotCount, symbolCount },
      now,
    });
    return { ranked: [], analyzedAt: now.toISOString() };
  }

  const scored = windows.map((window) => ({ ...scoreWindow(window), window }));

  logAnalysisEvent({
    message: "Scored swing windows",
    context: { scoredCount: scored.length },
    now,
  });

  const ranked = rankSwingResults(scored);

  logAnalysisEvent({
    message: "Ranked swing opportunities",
    context: { rankedCount: ranked.length },
    now,
  });

  return { ranked, analyzedAt: now.toISOString() };
}
