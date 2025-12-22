import { getRuntimeConfig, DEFAULT_RUNTIME_CONFIG } from "../runtime-config.js";
import { buildLogEntry, pruneLogs } from "../storage/retention.js";
import { storageAdapter } from "../storage/adapter.js";

/**
 * Lightweight structured logger for background scripts.
 * Centralizes log formatting, TTL handling, and retention pruning.
 */
export class LoggingService {
  constructor({ config = DEFAULT_RUNTIME_CONFIG, storage = storageAdapter } = {}) {
    this.config = getRuntimeConfig(config);
    this.storage = storage;
    this.logs = [];
    this.hydrating = this.hydrate();
  }

  /**
   * Appends a structured log entry and prunes expired rows.
   *
   * @param {object} params - Log definition.
   * @param {"error"|"warning"|"info"} params.type - Severity level.
   * @param {string} params.message - Human-readable summary.
   * @param {object} [params.context={}] - Structured metadata payload.
   * @param {string} [params.source="navigation"] - Originating module name.
   * @param {number} [params.ttlDays] - Optional TTL override in days.
   * @param {Date} [params.now=new Date()] - Clock used for deterministic tests.
   * @returns {object} Newly created log entry.
   */
  log({ type = "info", message, context = {}, source = "navigation", ttlDays, now = new Date() }) {
    const retentionDays = ttlDays ?? this.config.LOG_RETENTION_DAYS?.[type];
    const entry = buildLogEntry({ type, message, context, source, ttlDays: retentionDays }, now);
    this.logs.push(entry);
    this.persistLog(entry);
    this.prune(now);
    return entry;
  }

  /**
   * Removes expired log entries in-place.
   *
   * @param {Date} [now=new Date()] - Clock used for deterministic tests.
   * @returns {Array<object>} Active log collection.
   */
  prune(now = new Date()) {
    this.logs = pruneLogs(this.logs, { now });
    this.storage
      ?.pruneLogs?.(now)
      .catch((error) => console.warn("Failed to prune persisted logs", error)); // eslint-disable-line no-console
    return this.logs;
  }

  /**
   * Safe accessor to avoid mutation from consumers.
   *
   * @returns {Array<object>} Copy of current logs.
   */
  getLogs() {
    return [...this.logs];
  }

  async hydrate(now = new Date()) {
    const persisted = (await this.storage?.getLogs?.()) || [];
    this.logs = pruneLogs(persisted, { now });
    return this.logs;
  }

  persistLog(entry) {
    if (!this.storage?.saveLog) return;
    this.storage
      .saveLog(entry)
      .then(() => this.storage?.pruneLogs?.())
      .catch((error) => console.warn("Failed to persist log entry", error)); // eslint-disable-line no-console
  }
}

export const loggingService = new LoggingService();
