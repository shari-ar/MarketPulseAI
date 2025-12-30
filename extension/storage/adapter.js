import Dexie from "../vendor/dexie.mjs";
import {
  ANALYSIS_CACHE_FIELDS,
  ANALYSIS_CACHE_TABLE,
  DB_VERSION,
  LOG_FIELDS,
  LOG_TABLE,
  SNAPSHOT_FIELDS,
  SNAPSHOT_TABLE,
  getSchemaDefinition,
} from "./schema.js";
import { pruneLogs, pruneSnapshots } from "./retention.js";
import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from "../runtime-config.js";

const hasIndexedDb = typeof indexedDB !== "undefined";

/**
 * Normalize adapter arguments so callers can pass either a raw config object
 * or an options object that includes a logger.
 *
 * @param {object} [configOrOptions=DEFAULT_RUNTIME_CONFIG] - Config or options wrapper.
 * @returns {{config: object, logger: object|null}} Normalized adapter options.
 */
function resolveAdapterOptions(configOrOptions = DEFAULT_RUNTIME_CONFIG) {
  if (
    configOrOptions &&
    typeof configOrOptions === "object" &&
    ("config" in configOrOptions || "logger" in configOrOptions)
  ) {
    return {
      config: configOrOptions.config ?? DEFAULT_RUNTIME_CONFIG,
      logger: configOrOptions.logger ?? null,
    };
  }

  return { config: configOrOptions ?? DEFAULT_RUNTIME_CONFIG, logger: null };
}

/**
 * Coerce an arbitrary object into a whitelisted schema shape by dropping
 * undefined keys that are not present in the target record definition.
 *
 * @param {object} record - Raw record to sanitize.
 * @param {object} shape - Allowed field map for the record type.
 * @returns {object} Sanitized record containing only known keys.
 */
function sanitizeRecord(record, shape) {
  const normalized = {};
  Object.keys(shape).forEach((key) => {
    if (record[key] !== undefined) normalized[key] = record[key];
  });
  return normalized;
}

/**
 * Stable key used to deduplicate snapshots across storage backends.
 *
 * @param {object} record - Snapshot record with id and dateTime.
 * @returns {string} Composite identifier for the snapshot row.
 */
function snapshotKey(record) {
  return `${record.id}-${record.dateTime}`;
}

/**
 * In-memory adapter that mirrors the Dexie storage interface.
 * Useful for unit tests and environments without IndexedDB.
 */
class MemoryAdapter {
  constructor(configOrOptions = DEFAULT_RUNTIME_CONFIG) {
    const { config, logger } = resolveAdapterOptions(configOrOptions);
    this.config = getRuntimeConfig(config);
    this.logger = logger;
    this.snapshots = [];
    this.logs = [];
    this.analysisCache = new Map();
  }

  setLogger(logger) {
    this.logger = logger;
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG) {
    const previous = this.config;
    this.config = getRuntimeConfig(config);
    // Capture runtime config changes for observability in non-persisted environments.
    this.logger?.log?.({
      type: "debug",
      message: "Updated storage runtime config (memory)",
      source: "storage",
      context: { previousDb: previous?.DB_NAME, nextDb: this.config.DB_NAME },
      now: new Date(),
    });
  }

  async addSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    this.snapshots.push(...sanitized);
    this.logger?.log?.({
      type: "debug",
      message: "Stored snapshots in memory",
      source: "storage",
      context: { insertedCount: sanitized.length, total: this.snapshots.length },
      now: new Date(),
    });
    return { inserted: sanitized.length };
  }

  async upsertSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    const byKey = new Map(this.snapshots.map((snapshot) => [snapshotKey(snapshot), snapshot]));
    sanitized.forEach((record) => {
      if (!record.id || !record.dateTime) return;
      byKey.set(snapshotKey(record), record);
    });
    this.snapshots = Array.from(byKey.values());
    this.logger?.log?.({
      type: "debug",
      message: "Upserted snapshots in memory",
      source: "storage",
      context: { upsertedCount: sanitized.length, total: this.snapshots.length },
      now: new Date(),
    });
    return { upserted: sanitized.length, total: this.snapshots.length };
  }

  async getSnapshots() {
    this.logger?.log?.({
      type: "debug",
      message: "Fetched snapshots from memory",
      source: "storage",
      context: { count: this.snapshots.length },
      now: new Date(),
    });
    return [...this.snapshots];
  }

  async pruneSnapshots(now = new Date()) {
    const before = this.snapshots.length;
    this.snapshots = pruneSnapshots(this.snapshots, {
      now,
      retentionDays: this.config.RETENTION_DAYS,
      logger: this.logger,
      config: this.config,
    });
    const removed = before - this.snapshots.length;
    // Emit retention metrics for observability in memory-backed environments.
    this.logger?.log?.({
      type: "debug",
      message: "Pruned snapshots in memory",
      source: "storage",
      context: {
        removed,
        remaining: this.snapshots.length,
        retentionDays: this.config.RETENTION_DAYS,
      },
      now,
    });
    return { removed, remaining: this.snapshots.length };
  }

  async saveLog(entry) {
    this.logs.push(sanitizeRecord(entry, LOG_FIELDS));
    this.logger?.log?.({
      type: "debug",
      message: "Stored log entry in memory",
      source: "storage",
      context: { total: this.logs.length },
      now: new Date(),
    });
    return entry;
  }

  async getLogs() {
    this.logger?.log?.({
      type: "debug",
      message: "Fetched logs from memory",
      source: "storage",
      context: { count: this.logs.length },
      now: new Date(),
    });
    return [...this.logs];
  }

  async pruneLogs(now = new Date()) {
    const before = this.logs.length;
    this.logs = pruneLogs(this.logs, { now });
    const removed = before - this.logs.length;
    // Emit retention metrics for in-memory log storage.
    this.logger?.log?.({
      type: "debug",
      message: "Pruned logs in memory",
      source: "storage",
      context: { removed, remaining: this.logs.length },
      now,
    });
    return { removed, remaining: this.logs.length };
  }

  async updateAnalysisCache(symbols = [], lastAnalyzedAt) {
    symbols.forEach((symbol) => {
      if (!symbol) return;
      this.analysisCache.set(String(symbol), lastAnalyzedAt);
    });
    this.logger?.log?.({
      type: "debug",
      message: "Updated analysis cache in memory",
      source: "storage",
      context: { updatedCount: symbols.length, total: this.analysisCache.size },
      now: new Date(),
    });
    return { updated: symbols.length };
  }

  async getAnalysisCache() {
    this.logger?.log?.({
      type: "debug",
      message: "Fetched analysis cache from memory",
      source: "storage",
      context: { count: this.analysisCache.size },
      now: new Date(),
    });
    return Array.from(this.analysisCache.entries()).map(([symbol, lastAnalyzedAt]) => ({
      symbol,
      lastAnalyzedAt,
    }));
  }
}

/**
 * Dexie-backed adapter for persistence in the extension IndexedDB.
 */
class DexieAdapter extends MemoryAdapter {
  constructor(configOrOptions = DEFAULT_RUNTIME_CONFIG) {
    super(configOrOptions);
    this.db = new Dexie(this.config.DB_NAME);
    this.db.version(DB_VERSION).stores(getSchemaDefinition());
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG) {
    const previous = this.config;
    const nextConfig = getRuntimeConfig(config);
    const shouldReset = nextConfig.DB_NAME !== this.config.DB_NAME;
    this.config = nextConfig;
    if (shouldReset) {
      // Rebuild the Dexie instance when the configured database name changes.
      this.db.close();
      this.db = new Dexie(this.config.DB_NAME);
      this.db.version(DB_VERSION).stores(getSchemaDefinition());
    }
    // Track configuration changes and database reinitialization for diagnostics.
    this.logger?.log?.({
      type: "debug",
      message: "Updated storage runtime config (IndexedDB)",
      source: "storage",
      context: {
        previousDb: previous?.DB_NAME,
        nextDb: this.config.DB_NAME,
        reinitialized: shouldReset,
      },
      now: new Date(),
    });
  }

  async addSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    await this.db[SNAPSHOT_TABLE].bulkPut(sanitized);
    this.logger?.log?.({
      type: "debug",
      message: "Stored snapshots in IndexedDB",
      source: "storage",
      context: { insertedCount: sanitized.length },
      now: new Date(),
    });
    return { inserted: sanitized.length };
  }

  async upsertSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    await this.db[SNAPSHOT_TABLE].bulkPut(sanitized);
    this.logger?.log?.({
      type: "debug",
      message: "Upserted snapshots in IndexedDB",
      source: "storage",
      context: { upsertedCount: sanitized.length },
      now: new Date(),
    });
    return { upserted: sanitized.length };
  }

  async getSnapshots() {
    this.logger?.log?.({
      type: "debug",
      message: "Fetched snapshots from IndexedDB",
      source: "storage",
      context: {},
      now: new Date(),
    });
    return this.db[SNAPSHOT_TABLE].toArray();
  }

  async pruneSnapshots(now = new Date()) {
    const all = await this.getSnapshots();
    const pruned = pruneSnapshots(all, {
      now,
      retentionDays: this.config.RETENTION_DAYS,
      logger: this.logger,
      config: this.config,
    });
    if (pruned.length !== all.length) {
      await this.db[SNAPSHOT_TABLE].clear();
      await this.db[SNAPSHOT_TABLE].bulkPut(pruned);
    }
    const removed = all.length - pruned.length;
    // Record retention results for persisted snapshots to aid troubleshooting.
    this.logger?.log?.({
      type: "debug",
      message: "Pruned snapshots in IndexedDB",
      source: "storage",
      context: { removed, remaining: pruned.length, retentionDays: this.config.RETENTION_DAYS },
      now,
    });
    return { removed, remaining: pruned.length };
  }

  async saveLog(entry) {
    const sanitized = sanitizeRecord(entry, LOG_FIELDS);
    await this.db[LOG_TABLE].add(sanitized);
    this.logger?.log?.({
      type: "debug",
      message: "Stored log entry in IndexedDB",
      source: "storage",
      context: {},
      now: new Date(),
    });
    return sanitized;
  }

  async getLogs() {
    this.logger?.log?.({
      type: "debug",
      message: "Fetched logs from IndexedDB",
      source: "storage",
      context: {},
      now: new Date(),
    });
    return this.db[LOG_TABLE].toArray();
  }

  async pruneLogs(now = new Date()) {
    const all = await this.getLogs();
    const pruned = pruneLogs(all, { now });
    if (pruned.length !== all.length) {
      await this.db[LOG_TABLE].clear();
      await this.db[LOG_TABLE].bulkPut(pruned);
    }
    const removed = all.length - pruned.length;
    // Record retention results for persisted logs to aid troubleshooting.
    this.logger?.log?.({
      type: "debug",
      message: "Pruned logs in IndexedDB",
      source: "storage",
      context: { removed, remaining: pruned.length },
      now,
    });
    return { removed, remaining: pruned.length };
  }

  async updateAnalysisCache(symbols = [], lastAnalyzedAt) {
    const rows = symbols
      .filter(Boolean)
      .map((symbol) => sanitizeRecord({ symbol, lastAnalyzedAt }, ANALYSIS_CACHE_FIELDS));
    if (rows.length) await this.db[ANALYSIS_CACHE_TABLE].bulkPut(rows);
    this.logger?.log?.({
      type: "debug",
      message: "Updated analysis cache in IndexedDB",
      source: "storage",
      context: { updatedCount: rows.length },
      now: new Date(),
    });
    return { updated: rows.length };
  }

  async getAnalysisCache() {
    this.logger?.log?.({
      type: "debug",
      message: "Fetched analysis cache from IndexedDB",
      source: "storage",
      context: {},
      now: new Date(),
    });
    return this.db[ANALYSIS_CACHE_TABLE].toArray();
  }
}

/**
 * Select the optimal storage adapter based on IndexedDB availability.
 *
 * @param {object} config - Runtime configuration overrides or options wrapper.
 * @param {object} [config.logger] - Optional structured logger for storage operations.
 * @param {object} [config.config] - Runtime configuration overrides when passing an options wrapper.
 * @returns {MemoryAdapter|DexieAdapter} Storage adapter instance.
 */
export function createStorageAdapter(config = DEFAULT_RUNTIME_CONFIG) {
  const { config: resolvedConfig, logger } = resolveAdapterOptions(config);
  if (hasIndexedDb) {
    // Prefer persisted storage whenever IndexedDB is available.
    return new DexieAdapter({ config: resolvedConfig, logger });
  }
  return new MemoryAdapter({ config: resolvedConfig, logger });
}

export const storageAdapter = createStorageAdapter();
