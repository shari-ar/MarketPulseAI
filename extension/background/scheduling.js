import { isWithinBlackout, isWithinCollectionWindow, isPastAnalysisDeadline } from "./time.js";
import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";

export function shouldCollect(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  return isWithinCollectionWindow(now, config) && !isWithinBlackout(now, config);
}

export function shouldPause(now = new Date(), config = DEFAULT_RUNTIME_CONFIG) {
  return isWithinBlackout(now, config);
}

export function shouldRunAnalysis({
  now = new Date(),
  crawlComplete = false,
  config = DEFAULT_RUNTIME_CONFIG,
} = {}) {
  if (crawlComplete) return true;
  return isPastAnalysisDeadline(now, config);
}

export function describeSchedule(config = DEFAULT_RUNTIME_CONFIG) {
  return {
    blackout: `${config.MARKET_OPEN}-${config.MARKET_CLOSE}`,
    collectionWindow: `${config.MARKET_CLOSE}-${config.ANALYSIS_DEADLINE}`,
    retentionDays: config.RETENTION_DAYS,
    logRetention: { ...config.LOG_RETENTION_DAYS },
    topSwingCount: config.TOP_SWING_COUNT,
  };
}
