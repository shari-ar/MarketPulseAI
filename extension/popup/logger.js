import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";
import { LoggingService } from "../background/logger.js";

/**
 * Dedicated structured logger for popup UI events to keep telemetry consistent
 * with background scripts while remaining isolated per view instance.
 */
export const popupLogger = new LoggingService({ config: DEFAULT_RUNTIME_CONFIG });

/**
 * Helper to log popup lifecycle events with contextual metadata.
 *
 * @param {object} params - Log definition.
 * @param {"error"|"warning"|"info"|"debug"} [params.type="info"] - Severity level.
 * @param {string} params.message - Human-readable summary.
 * @param {object} [params.context={}] - Structured metadata payload.
 * @param {Date} [params.now=new Date()] - Clock used for deterministic tests.
 * @returns {object} Newly created log entry.
 */
export function logPopupEvent({ type = "info", message, context = {}, now = new Date() }) {
  return popupLogger.log({ type, message, context, source: "popup", now });
}
