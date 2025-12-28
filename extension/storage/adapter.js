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
  constructor(config = DEFAULT_RUNTIME_CONFIG) {
    this.config = getRuntimeConfig(config);
    this.snapshots = [];
    this.logs = [];
    this.analysisCache = new Map();
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG) {
    this.config = getRuntimeConfig(config);
  }

  async addSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    this.snapshots.push(...sanitized);
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
    return { upserted: sanitized.length, total: this.snapshots.length };
  }

  async getSnapshots() {
    return [...this.snapshots];
  }

  async pruneSnapshots(now = new Date()) {
    const before = this.snapshots.length;
    this.snapshots = pruneSnapshots(this.snapshots, {
      now,
      retentionDays: this.config.RETENTION_DAYS,
      config: this.config,
    });
    return { removed: before - this.snapshots.length, remaining: this.snapshots.length };
  }

  async saveLog(entry) {
    this.logs.push(sanitizeRecord(entry, LOG_FIELDS));
    return entry;
  }

  async getLogs() {
    return [...this.logs];
  }

  async pruneLogs(now = new Date()) {
    const before = this.logs.length;
    this.logs = pruneLogs(this.logs, { now });
    return { removed: before - this.logs.length, remaining: this.logs.length };
  }

  async updateAnalysisCache(symbols = [], lastAnalyzedAt) {
    symbols.forEach((symbol) => {
      if (!symbol) return;
      this.analysisCache.set(String(symbol), lastAnalyzedAt);
    });
    return { updated: symbols.length };
  }

  async getAnalysisCache() {
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
  constructor(config = DEFAULT_RUNTIME_CONFIG) {
    super(config);
    this.db = new Dexie(this.config.DB_NAME);
    this.db.version(DB_VERSION).stores(getSchemaDefinition());
  }

  updateConfig(config = DEFAULT_RUNTIME_CONFIG) {
    const nextConfig = getRuntimeConfig(config);
    const shouldReset = nextConfig.DB_NAME !== this.config.DB_NAME;
    this.config = nextConfig;
    if (shouldReset) {
      // Rebuild the Dexie instance when the configured database name changes.
      this.db.close();
      this.db = new Dexie(this.config.DB_NAME);
      this.db.version(DB_VERSION).stores(getSchemaDefinition());
    }
  }

  async addSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    await this.db[SNAPSHOT_TABLE].bulkPut(sanitized);
    return { inserted: sanitized.length };
  }

  async upsertSnapshots(records = []) {
    const sanitized = records.map((record) => sanitizeRecord(record, SNAPSHOT_FIELDS));
    await this.db[SNAPSHOT_TABLE].bulkPut(sanitized);
    return { upserted: sanitized.length };
  }

  async getSnapshots() {
    return this.db[SNAPSHOT_TABLE].toArray();
  }

  async pruneSnapshots(now = new Date()) {
    const all = await this.getSnapshots();
    const pruned = pruneSnapshots(all, {
      now,
      retentionDays: this.config.RETENTION_DAYS,
      config: this.config,
    });
    if (pruned.length !== all.length) {
      await this.db[SNAPSHOT_TABLE].clear();
      await this.db[SNAPSHOT_TABLE].bulkPut(pruned);
    }
    return { removed: all.length - pruned.length, remaining: pruned.length };
  }

  async saveLog(entry) {
    const sanitized = sanitizeRecord(entry, LOG_FIELDS);
    await this.db[LOG_TABLE].add(sanitized);
    return sanitized;
  }

  async getLogs() {
    return this.db[LOG_TABLE].toArray();
  }

  async pruneLogs(now = new Date()) {
    const all = await this.getLogs();
    const pruned = pruneLogs(all, { now });
    if (pruned.length !== all.length) {
      await this.db[LOG_TABLE].clear();
      await this.db[LOG_TABLE].bulkPut(pruned);
    }
    return { removed: all.length - pruned.length, remaining: pruned.length };
  }

  async updateAnalysisCache(symbols = [], lastAnalyzedAt) {
    const rows = symbols
      .filter(Boolean)
      .map((symbol) => sanitizeRecord({ symbol, lastAnalyzedAt }, ANALYSIS_CACHE_FIELDS));
    if (rows.length) await this.db[ANALYSIS_CACHE_TABLE].bulkPut(rows);
    return { updated: rows.length };
  }

  async getAnalysisCache() {
    return this.db[ANALYSIS_CACHE_TABLE].toArray();
  }
}

/**
 * Select the optimal storage adapter based on IndexedDB availability.
 *
 * @param {object} config - Runtime configuration overrides.
 * @returns {MemoryAdapter|DexieAdapter} Storage adapter instance.
 */
export function createStorageAdapter(config = DEFAULT_RUNTIME_CONFIG) {
  if (hasIndexedDb) {
    // Prefer persisted storage whenever IndexedDB is available.
    return new DexieAdapter(config);
  }
  return new MemoryAdapter(config);
}

export const storageAdapter = createStorageAdapter();
