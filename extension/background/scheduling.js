import { isWithinBlackout, isWithinCollectionWindow, isPastAnalysisDeadline } from "./time.js";
import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../runtime-config.js";

/**
 * Signals whether snapshot collection should occur for the provided timestamp.
 * Blackout periods (e.g., market open hours) are excluded even if in the collection window.
 *
 * @param {Date} [now=new Date()] - Time to evaluate.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration controlling windows.
 * @returns {boolean} True when collection is permitted.
 */
export function shouldCollect(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  const runtimeConfig = getRuntimeConfig(config);
  return isWithinCollectionWindow(now, runtimeConfig) && !isWithinBlackout(now, runtimeConfig);
}

/**
 * Indicates whether scheduled processing should pause due to an active blackout window.
 *
 * @param {Date} [now=new Date()] - Time to evaluate.
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration controlling windows.
 * @returns {boolean} True when work should pause.
 */
export function shouldPause(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  return isWithinBlackout(now, getRuntimeConfig(config));
}

/**
 * Decides when to run analysis based on crawl completion or passing the deadline.
 *
 * @param {object} [options] - Evaluation context.
 * @param {Date} [options.now=new Date()] - Time to evaluate.
 * @param {boolean} [options.crawlComplete=false] - Whether all expected symbols are collected.
 * @param {object} [options.config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration.
 * @returns {boolean} True when analysis should start.
 */
export function shouldRunAnalysis({
  now = new Date(),
  crawlComplete = false,
  config = DEFAULT_RUNTIME_CONFIG,
} = {}) {
  const runtimeConfig = getRuntimeConfig(config);
  if (crawlComplete) return true;
  return isPastAnalysisDeadline(now, runtimeConfig);
}

/**
 * Produces a human-readable snapshot of the configured trading schedule.
 *
 * @param {object} [config=DEFAULT_RUNTIME_CONFIG] - Runtime configuration controlling windows.
 * @returns {object} Serializable schedule overview useful for logging or debugging.
 */
export function describeSchedule(config = DEFAULT_RUNTIME_CONFIG) {
  const runtimeConfig = getRuntimeConfig(config);
  return {
    blackout: `${runtimeConfig.MARKET_OPEN}-${runtimeConfig.MARKET_CLOSE}`,
    collectionWindow: `${runtimeConfig.MARKET_CLOSE}-${runtimeConfig.ANALYSIS_DEADLINE}`,
    retentionDays: runtimeConfig.RETENTION_DAYS,
    logRetention: { ...runtimeConfig.LOG_RETENTION_DAYS },
    topSwingCount: runtimeConfig.TOP_SWING_COUNT,
  };
}
