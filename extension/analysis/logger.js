import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";
import { LoggingService } from "../background/logger.js";

/**
 * Structured logger for analysis workflows to align telemetry across scripts
 * while isolating state within the analysis worker.
 */
export const analysisLogger = new LoggingService({ config: DEFAULT_RUNTIME_CONFIG });

/**
 * Helper to record analysis lifecycle events with consistent metadata.
 *
 * @param {object} params - Log definition.
 * @param {"error"|"warning"|"info"} [params.type="info"] - Severity level.
 * @param {string} params.message - Human-readable summary.
 * @param {object} [params.context={}] - Structured metadata payload.
 * @param {Date} [params.now=new Date()] - Clock used for deterministic tests.
 * @returns {object} Newly created log entry.
 */
export function logAnalysisEvent({ type = "info", message, context = {}, now = new Date() }) {
  return analysisLogger.log({ type, message, context, source: "analysis", now });
}
