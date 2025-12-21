import { DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";
import { LoggingService } from "../background/logger.js";

/**
 * Dedicated logger for storage operations to keep retention and validation
 * telemetry consistent with the rest of the extension.
 */
export const storageLogger = new LoggingService({ config: DEFAULT_RUNTIME_CONFIG });

/**
 * Helper to record storage lifecycle events with contextual metadata.
 *
 * @param {object} params - Log definition.
 * @param {"error"|"warning"|"info"} [params.type="info"] - Severity level.
 * @param {string} params.message - Human-readable summary.
 * @param {object} [params.context={}] - Structured metadata payload.
 * @param {Date} [params.now=new Date()] - Clock used for deterministic tests.
 * @returns {object} Newly created log entry.
 */
export function logStorageEvent({ type = "info", message, context = {}, now = new Date() }) {
  return storageLogger.log({ type, message, context, source: "storage", now });
}
